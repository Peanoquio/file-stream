const path = require('path');
const AWS = require('aws-sdk');

const awsConfigPath = path.join(__dirname, '..', 'config', 'aws-config.json');
AWS.config.loadFromPath(awsConfigPath);

// Minimum 5MB per chunk (except the last part) 
// http://docs.aws.amazon.com/AmazonS3/latest/API/mpUploadComplete.html
const DEFAULT_PART_SIZE = 1024 * 1024 * 5; 


/**
 * The default callback
 * @param {string} label 
 * @param {Function} callback
 * @returns {Function} 
 */
const defaultCallback = (label, callback) => (err, data) => {
    if (!label || typeof label !== 'string' || label === '') {
        throw new TypeError(`defaultCallback invalid label: ${label}`);
    } else if (!callback || typeof callback !== 'function') {
        throw new TypeError(`defaultCallback invalid callback: ${callback}`);
    }

    if (err) {
        console.error(`${label} error:`, err);
        callback(err)
    } else {
        console.log(`${label} data:`, data);
        callback(null, data);
    }
};


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
     * @param {Object} awsOptions
     * @param {Function} callback
     * @returns {AWS.Request.promise}
     */
    checkBucketExist(bucketName, awsOptions = {}, callback = null) {
        let params = {
            Bucket: bucketName
        };
        params = Object.assign(params, awsOptions);

        if (callback) {
            this.awsS3.headBucket(params, defaultCallback(`checkBucketExist - ${bucketName}`, callback));
        } else {
            return this.awsS3.headBucket(params).promise();
        }
    }

    /**
     * Create the bucket
     * @param {string} bucketName
     * @param {Object} awsOptions
     * @param {Function} callback 
     * @returns {AWS.Request.promise}
     */
    createBucket(bucketName, awsOptions = {}, callback = null) {
        let params = {
            Bucket: bucketName
        };
        params = Object.assign(params, awsOptions);

        // { Location }
        if (callback) {
            this.awsS3.createBucket(params, defaultCallback(`createBucket - ${bucketName}`, callback));
        } else {
            return this.awsS3.createBucket(params).promise();
        }
    }

    /**
     * List objects
     * @param {Object} params
     * @param {Object} awsOptions 
     * @param {Function} callback 
     * @returns {AWS.Request.promise}
     */
    listObjects({ Bucket, MaxKeys }, awsOptions = {}, callback = null) {
        let params = { Bucket, MaxKeys };
        params = Object.assign(params, awsOptions);

        if (callback) {
            this.awsS3.listObjectsV2(params, defaultCallback(`listObjects - ${Bucket}`, callback));
        } else {
            return this.awsS3.listObjectsV2(params).promise();
        }
    }

    /**
     * Delete a group of objects
     * @param {Object} params
     * @param {Object} awsOptions 
     * @param {Function} callback 
     * @returns {AWS.Request.promise}
     */
    deleteObjects({ Bucket, Keys, Versions }, awsOptions = {}, callback = null) {
        if (!Keys || !Array.isArray(Keys)) {
            throw new TypeError(`Delete object keys are invalid:`, Keys);
        }

        // iterate through and format the keys
        const formattedKeys = Keys.map((currVal, index) => {
            let keyObj = { Key: currVal };
            // append the version if applicable
            if (Versions && Array.isArray(Versions)) {
                keyObj.VersionId = Versions[index];
            }
            return keyObj;
        });

        let params = {
            Bucket,
            Delete: {
                Objects: formattedKeys,
                Quiet: false
            }
        };

        params = Object.assign(params, awsOptions);

        if (callback) {
            this.awsS3.deleteObjects(params, defaultCallback(`deleteObjects - ${Bucket}/${Keys.join()}`, callback));
        } else {
            return this.awsS3.deleteObjects(params).promise();
        }
    }

    /**
     * Get the object
     * @param {Object} params
     * @param {Object} awsOptions 
     * @param {Function} callback 
     * @returns {AWS.Request.promise}
     */
    getObject({ Bucket, Key }, awsOptions = {}, callback = null) {
        let params = { Bucket, Key };
        params = Object.assign(params, awsOptions);

        if (callback) {
            this.awsS3.getObject(params, defaultCallback(`getObject - ${Bucket}/${Key}`, callback));
        } else {
            return this.awsS3.getObject(params).promise();
        }
    }

    /**
     * Put the object
     * https://stackoverflow.com/questions/38442512/difference-between-upload-and-putobject-for-uploading-a-file-to-s3
     * @param {Object} params
     * @param {Object} awsOptions
     * @param {Function} callback
     * @returns {AWS.Request.promise}
     */
    putObject({ Bucket, Key, Body }, awsOptions = {}, callback = null) {
        let params = { Bucket, Key, Body };
        params = Object.assign(params, awsOptions);

        // { ETag, VersionId }
        if (callback) {
            this.awsS3.putObject(params, defaultCallback(`putObject - ${Bucket}/${Key}`, callback));
        } else {
            return this.awsS3.putObject(params).promise();
        }
    }

    /**
     * Upload the object
     * Note that this is the only operation for which the SDK can retry requests with stream bodies.
     * https://stackoverflow.com/questions/38442512/difference-between-upload-and-putobject-for-uploading-a-file-to-s3
     * @param {Object} params
     * @param {Object} options
     * @param {Object} awsOptions
     * @param {Function} callback
     * @returns {AWS.S3.ManagedUpload}
     */
    async upload({ Bucket, Key, Body }, { maxRetries = 3, retryNum = 1 } = { maxRetries: 3, retryNum: 1 }, 
        awsOptions = { partSize: DEFAULT_PART_SIZE, queueSize: 1 }, callback = () => {}) {
        let params = { Bucket, Key, Body };
        params = Object.assign(params, awsOptions);

        /**
         * Helper function to upload
         * @param {Object} params 
         * @returns {AWS.S3.ManagedUpload.promise}
         */
        const uploadHelper = (params) => {
            return this.awsS3.upload(params).promise();
        };

        try {
            const data = await uploadHelper(params);
            // { ETag, VersionId }
            console.log(`Successfully uploaded: ${Bucket}/${Key} data:`, data);
            callback(null, data);
        } catch(err) {
            console.error(`Error when uploading: ${Bucket}/${Key} error:` , err);
            // support retry
            if (retryNum < maxRetries) {
                console.log(`Retrying upload: ${Bucket}/${Key} retryNum: ${retryNum}/${maxRetries}`);
                // recursive call
                this.upload(params, { retryNum: ++retryNum }, awsOptions, callback);
            } else {
                console.error(`Max retries reached. Failed uploading: ${Bucket}/${Key}`);
                callback(err);
            }
        }
    }

    /**
     * Lists the parts that have been uploaded for a specific multipart upload
     * @param {Object} params
     * @param {Object} awsOptions 
     * @param {Function} callback 
     * @returns {AWS.Request.promise}
     */
    listParts({ Bucket, Key, UploadId }, awsOptions = {}, callback = null) {
        let params = { Bucket, Key, UploadId };
        params = Object.assign(params, awsOptions);
        if (callback) {
            this.awsS3.listParts(params, defaultCallback(`listParts - ${Bucket}/${Key}/${UploadId}`, callback));
        } else {
            return this.awsS3.listParts(params).promise();
        }
    }

    /**
     * Complete the multipart upload
     * @param {Object} params
     * @param {Object} awsOptions
     * @param {Function} callback
     * @returns {AWS.Request.promise}
     */
    completeMultipartUpload({ Bucket, Key, MultipartUpload, UploadId }, awsOptions = {}, callback = null) {
        let params = { Bucket, Key, MultipartUpload, UploadId };
        params = Object.assign(params, awsOptions);

        // { Bucket, ETag, Key, Location }
        if (callback) {
            this.awsS3.completeMultipartUpload(params, defaultCallback(`completeMultipartUpload - ${Bucket}/${Key}/${UploadId}`, callback));
        } else {
            return this.awsS3.completeMultipartUpload(params).promise();
        }
    }

    /**
     * Abort the multipart upload
     * @param {Object} params
     * @param {Object} awsOptions
     * @param {Function} callback
     * @returns {AWS.Request.promise}
     */
    abortMultipartUpload({ Bucket, Key, UploadId }, awsOptions = {}, callback = null) {
        let params = { Bucket, Key, UploadId };
        params = Object.assign(params, awsOptions);

        if (callback) {
            this.awsS3.abortMultipartUpload(params, defaultCallback(`abortMultipartUpload - ${Bucket}/${Key}/${UploadId}`, callback));
        } else {
            return this.awsS3.abortMultipartUpload(params).promise();
        }
    }

    /**
     * Uploads a part of the multi-part file/buffer
     * @param {Object} params
     * @param {Object} options 
     * @param {Object} awsOptions
     * @returns {Promise}
     */
    uploadPart({ Body, Bucket, Key, PartNumber, UploadId }, { maxRetries = 3, retryNum = 1 } = { maxRetries: 3, retryNum: 1 }, awsOptions = {}) {
        let partParams = { Body, Bucket, Key, PartNumber, UploadId };
        partParams = Object.assign(partParams, awsOptions);

        /**
         * Helper function to upload part
         * @param {Object} partParams 
         * @returns {AWS.Request.promise}
         */
        const uploadPartHelper = (partParams) => {
            return this.awsS3.uploadPart(partParams).promise();
        };

        const identifier = `${Bucket}/${Key}/${PartNumber}/${UploadId}`;

        return new Promise(async (resolve, reject) => {
            try {
                const data = await uploadPartHelper(partParams);
                console.log(`Successfully upload part: ${identifier} data:`, data);
                resolve(data);
            } catch (err) {
                console.error(`Upload part: ${identifier} error:`, err);
                // support retry
                if (retryNum < maxRetries) {
                    console.log(`Retrying upload of part: ${identifier}`);
                    // recursive call
                    this.uploadPart(partParams, { retryNum: ++retryNum }, awsOptions, callback);
                } else {
                    console.error(`Max retries reached. Failed uploading part: ${identifier}`);
                    reject(err);
                }
            }
        });
    }

    /**
     * Creates a multi-part upload (breaks the file into parts before uploading each part)
     * https://docs.aws.amazon.com/AmazonS3/latest/dev/mpuoverview.html
     * Note: After you initiate multipart upload and upload one or more parts, 
     * you must either complete or abort multipart upload in order to stop getting charged for storage of the uploaded parts. 
     * Only after you either complete or abort multipart upload, Amazon S3 frees up the parts storage and stops charging you for the parts storage.
     * @param {Object} params
     * @param {Buffer} buffer 
     * @param {Number} partNum 
     * @param {Number} partSize 
     * @param {Object} awsOptions
     * @param {Function} callback 
     * @returns {AWS.Request.promise}
     */
    async createMultipartUpload({ Bucket, Key, ContentType }, buffer, partNum = 0, partSize = DEFAULT_PART_SIZE, awsOptions = {}, callback = () => {}) {
        let params = { Bucket, Key, ContentType };
        params = Object.assign(params, awsOptions);

        /**
         * Helper function to perform the multi-part upload
         * @param {Object} params
         * @returns {AWS.Request.promise} 
         */
        const createMultipartUploadHelper = (params) => {
            return this.awsS3.createMultipartUpload(params).promise();
        };

        let success = false;
        let multipartMap = null;
        let uploadId = null;
        let identifier = null;

        try {
            const data = await createMultipartUploadHelper(params);
            
            const bufferLen = buffer.length;
            const totalParts = Math.ceil(bufferLen / partSize);

            multipartMap = {
                Parts: []
            };
            uploadId = data.UploadId;
            identifier = `${Bucket}/${Key}/${uploadId}`;

            console.log(`Created multipart upload: ${identifier} bufferLen: ${bufferLen}, totalParts: ${totalParts} data:`, data);

            const uploadPartTasks = [];
            // prepare the upload part tasks (based on the buffer chunks)
            for (let rangeStart = 0; rangeStart < bufferLen; rangeStart += partSize) {
                let rangeEnd = Math.min(rangeStart + partSize, bufferLen);

                let partParams = {
                    Body: buffer.slice(rangeStart, rangeEnd),
                    Bucket: Bucket,
                    Key: Key,
                    UploadId: uploadId,
                    PartNumber: ++partNum
                };

                console.log(`Uploading ${identifier} part: ${partParams.PartNumber} rangeStart: ${rangeStart} rangeEnd: ${rangeEnd}`);
                // upload the part
                let taskPromise = this.uploadPart(partParams);
                uploadPartTasks.push(taskPromise);
            } // end loop

            if (partNum !== totalParts) {
                throw new Error(`Invalid parts ${identifier}`);
            }

            // process the upload part tasks
            Promise.all(uploadPartTasks).then(results => {
                for (let x = 0, len = results.length; x < len; ++x) {
                    let data = results[x];
                    // add the uploaded part to the multipart map
                    multipartMap.Parts[x] = {
                        ETag: data.ETag,
                        PartNumber: Number(x)
                    };
                    console.log(`completed ${identifier} part: ${x}`, 'data:', data);
                } // end loop

                success = true;

            }).catch(err => {
                throw err;
            });

        } catch (err) {
            console.error(`Error when doing a multipart upload ${identifier} error:`, err); 
            sucess = false;
            
        } finally {
            const listPartsCallback = (err, result) => {
                this.listParts({ Bucket, Key, UploadId: uploadId }, {}, callback);
            };

            // NOTE: this is a very important step
            if (success) {
                // when all the parts have been uploaded
                const completeParams = {
                    Bucket: Bucket,
                    Key: Key,
                    MultipartUpload: multipartMap,
                    UploadId: uploadId
                };
                this.completeMultipartUpload(completeParams, {}, listPartsCallback);
            } else {
                this.abortMultipartUpload({ Bucket, Key, UploadId: uploadId }, {}, listPartsCallback);
            }
        }
    }

} // end class


const awsUtil = new AwsUtil();
module.exports = awsUtil;