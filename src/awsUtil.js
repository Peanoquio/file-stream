const AWS = require('aws-sdk');
AWS.config.loadFromPath('../config/aws-config.json');

// Minimum 5MB per chunk (except the last part) 
// http://docs.aws.amazon.com/AmazonS3/latest/API/mpUploadComplete.html
const DEFAULT_PART_SIZE = 1024 * 1024 * 5; 


/**
 * The utility class to work with AWS
 */
class AwsUtil {

    /**
     * The constructor
     */
    constructor() {
        // Create an S3 client
        this.awsS3 = new AWS.S3();
    }

    /**
     * Check if the bucket exists
     * @param {string} bucketName 
     * @param {Function} callback
     * @returns {AWS.Request}
     */
    checkBucketExist(bucketName, callback = () => {}) {
        const params = {
            Bucket: bucketName
        };
        return this.awsS3.headBucket(params, (err, data) => {
            if (err) {
                console.error(err);
                callback(err);
            } else {
                console.log(`Bucket exists: ${bucketName}`);
                callback(null, data);
            }
        });
    }

    /**
     * Create the bucket
     * @param {string} bucketName
     * @param {Function} callback 
     * @returns {AWS.Request}
     */
    createBucket(bucketName, callback = () => {}) {
        const params = {
            Bucket: bucketName
        };
        return this.awsS3.createBucket(params, (err, data) => {
            if (err) {
                console.error(err);
                callback(err);
            } else {
                // { Location }
                console.log(`Bucket successfully created at: ${data.Location}`);
                callback(null, data);
            }
        });
    }

    /**
     * Put/upload the object
     * @param {Object} params
     * @param {Function} callback
     * @returns {AWS.Request}
     */
    putObject({ Bucket, Key, Body }, callback = () => {}) {
        return this.awsS3.putObject({ Bucket, Key, Body }, (err, data) => {
            if (err) {
                console.error(err);
                callback(err);
            } else {
                // { ETag, VersionId }
                console.log('Successfully uploaded data to ' + Bucket + '/' + Key);
                callback(null, data);
            }
        });
    }

    /**
     * Complete the multipart upload
     * @param {Object} params
     * @param {Object} options
     * @param {Function} callback
     * @returns {AWS.Request}
     */
    completeMultipartUpload({ Bucket, Key, MultipartUpload, UploadId }, { startTime }, callback = () => {}) {
        return this.awsS3.completeMultipartUpload({ Bucket, Key, MultipartUpload, UploadId }, (err, data) => {
            if (err) {
                console.error(`Error occurred while completing the multipart upload: ${err}`);
                callback(err);
            } else {
                if (startTime) {
                    const delta = (new Date() - startTime) / 1000;
                    console.log(`Upload completed in ${delta} seconds`);
                }
                // { Bucket, ETag, Key, Location }
                callback(null, data);
            }
        });
    }

    /**
     * Uploads a part of the multi-part file/buffer
     * @param {Object} params
     * @param {Object} multipartMap 
     * @param {Object} options 
     * @param {Function} callback 
     * @returns {AWS.Request}
     */
    uploadPart({ Body, Bucket, Key, PartNumber, UploadId }, multipartMap, 
        { maxRetries = 3, retryNum = 1, totalParts, startTime } = { maxRetries: 3, retryNum: 1, totalParts, startTime }, callback = () => {}) {
        const self = this;
        const partParams = { Body, Bucket, Key, PartNumber, UploadId };
        // upload the part
        return this.awsS3.uploadPart(partParams, function(err, data) {
            if (err) {
                console.error('Upload part error:', err);
                // support retry
                if (retryNum < maxRetries) {
                    console.log('Retrying upload of part:', partParams.PartNumber);
                    // recursive call
                    self.uploadPart(partParams, multipartMap, { retryNum: ++retryNum, totalParts, startTime });
                } else {
                    console.error('Max retries reached. Failed uploading part:', partParams.PartNumber);
                    callback(err);
                }

            } else {
                // add the uploaded part to the multipart map
                multipartMap.Parts[partParams.PartNumber - 1] = {
                    ETag: data.ETag,
                    PartNumber: Number(partParams.PartNumber)
                };

                console.log('completed part:', partParams.PartNumber, 'data:', data);

                // when all the parts have been uploaded
                if (partParams.PartNumber === totalParts) {
                    const params = {
                        Bucket: partParams.Bucket,
                        Key: partParams.Key,
                        MultipartUpload: multipartMap,
                        UploadId: partParams.UploadId
                    };
                    // NOTE: this is a very important step
                    self.completeMultipartUpload(params, { startTime }, callback);
                }
            }
        });
    }

    /**
     * Creates a multi-part upload (breaks the file into parts before uploading each part)
     * @param {Object} params
     * @param {Buffer} buffer 
     * @param {Number} partNum 
     * @param {Number} partSize 
     * @param {Function} callback 
     * @returns {AWS.Request}
     */
    createMultipartUpload({ Bucket, Key, ContentType }, buffer, partNum = 0, partSize = DEFAULT_PART_SIZE, callback = () => {}) {
        return this.awsS3.createMultipartUpload({ Bucket, Key, ContentType }, (err, data) => {
            if (err) { 
                console.error('Error when doing a multipart upload', err); 
                callback(err);
                return; 
            }

            console.log('Bucket:', Bucket, 'Key:', Key, 'data:', data);

            const bufferLen = buffer.length;
            const totalParts = Math.ceil(bufferLen / partSize);

            const multipartMap = {
                Parts: []
            };

            // process each part/chunk and upload it
            for (let rangeStart = 0; rangeStart < bufferLen; rangeStart += partSize) {
                ++partNum;
                let end = Math.min(rangeStart + partSize, bufferLen);

                let partParams = {
                    Body: buffer.slice(rangeStart, end),
                    Bucket: Bucket,
                    Key: Key,
                    PartNumber: partNum,
                    UploadId: data.UploadId
                };

                console.log('Uploading part:', partParams.PartNumber, 'rangeStart:', rangeStart);
                this.uploadPart(partParams, multipartMap, { totalParts, startTime: new Date() }, callback);
            } // end loop
        });
    }

} // end class


const awsUtil = new AwsUtil();
module.exports = awsUtil;