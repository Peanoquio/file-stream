const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const tar = require('tar');
const crypto = require('crypto');
const streamifier = require('streamifier');
const { Transform, PassThrough } = require('stream');

const configJson = require('../config/config.json');
const awsUtil = require('./awsUtil');


// default crypto alogrithm
//const ALGO = 'aes-256-ctr';
const ALGO = 'aes192';
const COMPRESSED_FILE_EXT = '.gz';


/**
 * Utility function to get the file stat 
 * @param {string} filePath 
 * @returns {Promise}
 */
const getFileStatPromise = (filePath) => {
    return new Promise((resolve, reject) => {
        fs.stat(filePath, (err, data) => {
            if (err) {
                reject(err);
            } else {
                resolve(data);
            }
        });
    });
};


/**
 * The utility class to support handling file compression, encryption, etc. 
 */
class FileUtil {

    /**
     * The constructor
     * @param {string} cryptoAlgorithm 
     */
    constructor(cryptoAlgorithm = ALGO) {
        this.algo = cryptoAlgorithm;
    }

    /**
     * Show the progress when compressing/encrypting the file and vice versa
     */
    showProgress() {
        const transformStream = new Transform({
            transform(chunk, encoding, callback) {
                process.stdout.write('.');	
                this.push(chunk);
                callback();
            }
        });
        return transformStream;
    }

    /**
     * Compress and encrypt file
     * @param {Buffer|string} param 
     * @param {string} filePath 
     * @param {Object} options 
     * @returns {Promise}
     */
    compressAndEncrypt(param, filePath = '', options = {}) {
        return new Promise((resolve, reject) => {
            try {
                let readStream = null;
                if (Buffer.isBuffer(param)) {
                    readStream = streamifier.createReadStream(param, options);
                } else if (typeof param === 'string') {
                    readStream = fs.createReadStream(filePath, options);
                } else {
                    throw new TypeError(`param has invalid type: ${typeof param}`);
                }
                
                console.log(readStream);
                const encryptedCompressedReadStream = readStream
                    .pipe(zlib.createGzip()) // compress file
                    .on('error', (err) => {
                        console.error('file compression error:', err);
                        reject(err);
                    })
                    .pipe(crypto.createCipher(this.algo, configJson.FILE_CRYPTO_SECRET_KEY)) // encrypt file
                    .on('error', (err) => {
                        console.error('file encryption error:', err);
                        reject(err);
                    })
                    .pipe(this.showProgress())
                    .on('finish', () => {
                        console.log(`completed compressing and encrypting file: ${filePath}`);
                    });

                resolve(encryptedCompressedReadStream);

            } catch (err) {
                console.error('compressAndEncrypt error:', err);
                reject(err);
            }
        });
    }

    /**
     * Streams the file (to be written to a destination)
     * @param {Buffer|string} param 
     * @param {string} fileName 
     * @param {Object} options 
     * @param {Object} readStreamOptions 
     * @returns {Promise}
     */
    streamFileWrite(param, fileName, { writeToFile, uploadToAws, awsParams = {} } = {}, readStreamOptions = {}) {
        return new Promise(async (resolve, reject) => {
            try {
                const filePath = path.join(__dirname, '..', configJson.FILE_PATH_DIR, fileName);

                const encryptedCompressedReadStream = await this.compressAndEncrypt(param, filePath, readStreamOptions);

                if (writeToFile) {
                    // stream to a file
                    encryptedCompressedReadStream
                        .pipe(fs.createWriteStream(`${filePath}${COMPRESSED_FILE_EXT}`))
                        .on('error', (err) => {
                            console.error('stream to file error:', err);
                            reject(err);
                        })
                        .on('finish', () => {
                            console.log(`completed streaming to file: ${filePath}${COMPRESSED_FILE_EXT}`);
                        });
                }
                
                if (uploadToAws) {
                    /**
                     * Helper function to upload the buffer stream to AWS through piping
                     * @param {awsUtil} awsUtil 
                     * @param {Object} awsParams 
                     * @param {string} fileName 
                     * @returns {PassThrough}
                     */
                    const uploadStreamToAws = (awsUtil, awsParams, fileName) => {
                        const passingStream = new PassThrough();
                        awsParams.Key = `${configJson.AWS_BUCKET_FOLDER_NAME}/${fileName}`;
                        awsParams.Body = passingStream;                 
                        // upload to AWS
                        awsUtil.upload(awsParams, {}, {}, (err, data) => {
                            if (err) {
                                throw err;
                            }
                        });
                        return passingStream;
                    };

                    if (!awsParams.Bucket || (awsParams.Bucket && typeof awsParams.Bucket !== 'string')) {
                        throw new Error(`uploadStreamToAws error due to invalid awsParams.Bucket: ${awsParams.Bucket}`);
                    } 

                    // upload to AWS
                    encryptedCompressedReadStream
                        .pipe(uploadStreamToAws(awsUtil, awsParams, `${fileName}${COMPRESSED_FILE_EXT}`))
                        .on('error', (err) => {
                            console.error('upload to AWS error:', err);
                            reject(err);
                        })
                        .on('finish', () => {
                            console.log(`completed uploading to AWS: ${fileName}${COMPRESSED_FILE_EXT}`);
                        });
                }

                resolve({ message: `file stream write success for file: ${fileName}` });

            } catch (err) {
                console.error('streamFileWrite error:', err);
                reject(err);
            }
        });
    }

    /**
     * Decrypt and extract file
     * @param {string} filePath 
     * @param {Object} params
     * @returns {Promise}
     */
    decryptAndExtract(filePath, { writeToFile }) {
        return new Promise(async (resolve, reject) => {
            try {
                filePath += COMPRESSED_FILE_EXT;
                const fileStat = await getFileStatPromise(`${filePath}`);
                // check if file exists
                if (fileStat && fileStat.isFile()) {
                    const readStream = fs.createReadStream(`${filePath}`);

                    const decryptedExtractedReadStream = readStream
                        .pipe(crypto.createDecipher(this.algo, configJson.FILE_CRYPTO_SECRET_KEY)) // decrypt file
                        .on('error', (err) => {
                            console.error('file decryption error:', err);
                            reject(err);
                        })
                        .pipe(zlib.createGunzip()) // unzip file
                        .on('error', (err) => {
                            console.error('file extraction error:', err);
                            reject(err);
                        })
                        .pipe(this.showProgress())
                        .on('finish', () => {
                            console.log(`completed decrypting and extracting file: ${filePath}`);
                        });
        
                    // stream to a file
                    decryptedExtractedReadStream
                        .pipe((function() {
                            if (writeToFile) {
                                return fs.createWriteStream(`${filePath}`);
                            } else {
                                return new PassThrough();
                            }
                        })())
                        .on('error', (err) => {
                            console.error('stream to file error:', err);
                            reject(err);
                        })
                        .on('finish', () => {
                            if (writeToFile) {
                                console.log(`completed streaming to file: ${filePath}`);
                            }
                        });
        
                    resolve(decryptedExtractedReadStream);

                } else {
                    throw new Error(`file does not exist: ${filePath}`);
                }
            } catch (err) {
                console.error('decryptAndExtract error:', err);
                reject(err);
            }
        });
    }

    /**
     * Streams the file (being read)
     * @param {string} fileName 
     * @param {Object} params 
     * @returns {Promise}
     */
    streamFileRead(fileName, { response, request, writeToFile, fileData }) {
        return new Promise(async (resolve, reject) => {
            try {
                const fileType = fileData.mimetype;
                console.log('fileData:', fileData);

                const filePath = path.join(__dirname, '..', configJson.FILE_PATH_DIR, fileName);

                // check if the decrypted/extracted file already exists
                const fileStat = await getFileStatPromise(filePath);
                if (fileStat && fileStat.isFile()) {
                    // streaming in chunks
                    await this.streamChunkToHttpResponse(response, request, filePath, fileType);
                } else {
                    const decryptedExtractedReadStream = await this.decryptAndExtract(filePath, { response, request, writeToFile, fileData });
                
                    // stream back to the HTTP response
                    decryptedExtractedReadStream
                        .pipe((function() {
                            if (response) {
                                return response;
                            } else {
                                return new PassThrough();
                            }
                        })())
                        .on('error', (err) => {
                            console.error('stream to response error:', err);
                            reject(err);
                        })
                        .on('finish', () => {
                            if (response) {
                                console.log(`completed streaming to response: ${filePath}`);
                            }
                            resolve({ message: `file stream read success for file: ${fileName}` });
                        });
                }

            } catch (err) {
                console.error('streamFileRead error:', err);
                reject(err);
            }
        });
    }

    /**
     * Streams chunk by chunk to the HTTP response
     * @param {Response} response 
     * @param {Request} request 
     * @param {string} filePath 
     * @param {string} fileType 
     * @returns {Promise}
     */
    streamChunkToHttpResponse(response, request, filePath, fileType) {
        return new Promise(async (resolve, reject) => {
            try {
                const httpHeaderRange = request.headers.range
                console.log('httpHeaderRange:', httpHeaderRange);

                const fileStat = await getFileStatPromise(`${filePath}`);
                // check if file exists
                if (!fileStat || !fileStat.isFile()) {
                    throw new Error(`file does not exist: ${filePath}`);
                }
                const fileSize = fileStat.size;

                // https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Range
                if (httpHeaderRange) {
                    const parts = httpHeaderRange.replace(/bytes=/, "").split("-");
                    // get the start and end bytes (parse to decimal int)
                    const start = parseInt(parts[0], 10);
                    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
                    // size of the chunk
                    const chunksize = (end - start) + 1;

                    const readStream = fs.createReadStream(`${filePath}`, { start, end });

                    // https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Range
                    // The Content-Range response HTTP header indicates where in a full body message a partial message belongs.
                    const head = {
                        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                        'Accept-Ranges': 'bytes',
                        'Content-Length': chunksize,
                        'Content-Type': fileType,
                    }
                    /*
                    The HTTP 206 Partial Content success status response code indicates that the request has succeeded 
                    and has the body contains the requested ranges of data, as described in the Range header of the request.
                    If there is only one range, the Content-Type of the whole response is set to the type of the document, 
                    and a Content-Range is provided.
                    If several ranges are sent back, the Content-Type is set to multipart/byteranges and each fragment covers one range, 
                    with Content-Range and Content-Type describing it.
                    */
                    response.writeHead(206, head);
                    readStream
                        .pipe(response)
                        .on('error', (err) => {
                            console.error('stream partial chunk to response error:', err);
                            reject(err);
                        })
                        .on('finish', () => {
                            console.log(`completed streaming partial chunk to response: ${filePath}`);
                            resolve({ message: `completed streaming partial chunk to response: ${filePath}` });
                        });
                } else {
                    const head = {
                        'Content-Length': fileSize,
                        'Content-Type': fileType,
                    }

                    const readStream = fs.createReadStream(`${filePath}`);

                    response.writeHead(200, head);
                    readStream
                        .pipe(response)
                        .on('error', (err) => {
                            console.error('stream chunk to response error:', err);
                            reject(err);
                        })
                        .on('finish', () => {
                            console.log(`completed streaming chunk to response: ${filePath}`);
                            resolve({ message: `completed streaming chunk to response: ${filePath}` });
                        });
                }

            } catch (err) {
                console.error('streamChunkToHttpResponse error:', err);
                reject(err);
            }
        });
    }

} // end class


const fileUtil = new FileUtil();
module.exports = fileUtil;