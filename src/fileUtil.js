const fs = require('fs');
const zlib = require('zlib');
const tar = require('tar');
const crypto = require('crypto');
const streamifier = require('streamifier');
const { Transform, PassThrough } = require('stream');

// default crypto alogrithm
//const ALGO = 'aes-256-ctr';
const ALGO = 'aes192';
// TODO: specify own secret key
const SECRET_KEY = 'secret';


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
        // we reuse these streams since FileUtil will be instantiated per request
        this.readStream = null;
        this.transformStream = null;
    }

    /**
     * Show the progress when compressing/encrypting the file and vice versa
     */
    showProgress() {
        if (!this.transformStream) {
            this.transformStream = new Transform({
                transform(chunk, encoding, callback) {
                    process.stdout.write('.');	
                    this.push(chunk);
                    callback();
                }
            });
        }
        return this.transformStream;
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
            if (!this.readStream) {
                if (Buffer.isBuffer(param)) {
                    this.readStream = streamifier.createReadStream(param, options);
                } else if (typeof param === 'string') {
                    filePath = param;
                    this.readStream = fs.createReadStream(param, options);
                } else {
                    throw new TypeError(`param has invalid type: ${typeof param}`);
                }
            }
            console.log(this.readStream);
            this.readStream
                .pipe(zlib.createGzip()) // compress file
                .on('error', (err) => {
                    console.error('file compression error:', err);
                    reject(err);
                })
                .pipe(crypto.createCipher(this.algo, SECRET_KEY)) // encrypt file
                .on('error', (err) => {
                    console.error('file encryption error:', err);
                    reject(err);
                })
                .pipe(this.showProgress())
                .pipe(fs.createWriteStream(`${filePath}.gz`))
                .on('error', (err) => {
                    console.error('file creation error:', err);
                    reject(err);
                })
                .on('finish', () => {
                    console.log(`completed compressing and encrypting file: ${filePath}`);
                    resolve(true);
                });
        });
    }

    /**
     * Decrypt and extract file
     * @param {string} filePath 
     * @param {Object} params
     * @returns {Promise}
     */
    decryptAndExtract(filePath, { writeToFile }) {
        return new Promise((resolve, reject) => {
            if (!this.readStream) {
                this.readStream = fs.createReadStream(`${filePath}.gz`);
            }

            const decryptedExtractedReadStream = this.readStream
                .pipe(crypto.createDecipher(this.algo, SECRET_KEY)) // decrypt file
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
        });
    }

    /**
     * Streams the file (being read)
     * @param {string} filePath 
     * @param {Object} params 
     * @returns {Promise}
     */
    async streamFileRead(filePath, { response, request, writeToFile, fileData }) {
        return new Promise(async (resolve, reject) => {
            const fileType = fileData.mimetype;
            console.log('fileData:', fileData);

            // check if the decrypted/extracted file already exists
            fs.exists(filePath, async (exists) => {
                if (exists) {
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
                                resolve(true);
                            }
                        });
                }
            });
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
        return new Promise((resolve, reject) => {
            const httpHeaderRange = request.headers.range
            console.log('httpHeaderRange:', httpHeaderRange);

            const fileStat = fs.statSync(filePath);
            const fileSize = fileStat.size;

            // https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Range
            if (httpHeaderRange) {
                const parts = httpHeaderRange.replace(/bytes=/, "").split("-");
                // get the start and end bytes (parse to decimal int)
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
                // size of the chunk
                const chunksize = (end - start) + 1;

                if (!this.readStream) {
                    this.readStream = fs.createReadStream(`${filePath}`, { start, end });
                }

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
                this.readStream
                    .pipe(response)
                    .on('error', (err) => {
                        console.error('stream partial chunk to response error:', err);
                        reject(err);
                    })
                    .on('finish', () => {
                        if (response) {
                            console.log(`completed streaming partial chunk to response: ${filePath}`);
                            resolve(true);
                        }
                    });
            } else {
                const head = {
                    'Content-Length': fileSize,
                    'Content-Type': fileType,
                }
                if (!this.readStream) {
                    this.readStream = fs.createReadStream(`${filePath}`);
                }
                response.writeHead(200, head);
                this.readStream
                    .pipe(response)
                    .on('error', (err) => {
                        console.error('stream chunk to response error:', err);
                        reject(err);
                    })
                    .on('finish', () => {
                        if (response) {
                            console.log(`completed streaming chunk to response: ${filePath}`);
                            resolve(true);
                        }
                    });
            }
        });
    }

} // end class


module.exports = FileUtil;