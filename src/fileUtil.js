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
     * @param {string} filename 
     * @param {Object} options 
     */
    compressAndEncrypt(param, filename = '', options = {}) {
        return new Promise((resolve, reject) => {
            if (!this.readStream) {
                if (Buffer.isBuffer(param)) {
                    this.readStream = streamifier.createReadStream(param, options);
                } else if (typeof param === 'string') {
                    filename = param;
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
                .pipe(fs.createWriteStream(`${filename}.gz`))
                .on('error', (err) => {
                    console.error('file creation error:', err);
                    reject(err);
                })
                .on('finish', () => {
                    console.log(`Completed compressing and encrypting file: ${filename}`);
                    resolve(true);
                });
        });
    }

    /**
     * Decrypt and extract file
     * @param {string} filename 
     * @param {Object} params
     */
    decryptAndExtract(filename, { response, request, writeToFile, filedata }) {
        const fileSize = filedata.size
        const range = request.headers.range
        console.log('range:', range);
        console.log('filedata:', filedata);

        return new Promise((resolve, reject) => {
            if (!this.readStream) {
                this.readStream = fs.createReadStream(`${filename}.gz`);
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
                    console.log(`Completed decrypting and extracting file: ${filename}`);
                });

            // stream to a file
            decryptedExtractedReadStream
                .pipe((function() {
                    if (writeToFile) {
                        return fs.createWriteStream(`${filename}`);
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
                        console.log(`Completed streaming to file: ${filename}`);
                        resolve(true);
                    }
                });

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
                        console.log(`Completed streaming to response: ${filename}`);
                        resolve(true);
                    }
                });
        });
    }

} // end class


module.exports = FileUtil;