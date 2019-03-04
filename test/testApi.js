const publicConfig = require('../config/publicConfig.json');
const request = require('request');

// Mocha and Chai test modules
const assert = require('assert');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
chai.use(chaiAsPromised).should();


const baseUrl = `http://${publicConfig.HTTP_SERVER_IP}:${publicConfig.HTTP_SERVER_PORT}`;

/**
 * Send the request
 * @param {Object} options 
 * @returns {Promise}
 */
const sendRequest = (options) => {
    return new Promise((resolve, reject) => {
        //console.log('????? sendRequest');
        request(options, (error, response, body) => {
            if (error) {
                //console.error('????? error', error);
                reject(error);
            } else {
                //console.log('????? body', body);
                resolve(body);
            }
        });
    });
};

const fileName = 'example';
const fileExtType = 'txt';
const fileContent = 'this is just an example';

// test script: writeToAws
describe('writeToAws', function() {
    it('upload to AWS', function(done) {
        const url = `${baseUrl}/file/${fileName}`;

        // form data
        const formData = { 
            action: 'upload' 
        };
        formData[publicConfig.FILE_FORM_UPLOAD_FIELD_KEY] = { 
            value: fileContent,
            options: { 
                filename: `${fileName}.${fileExtType}`,
                contentType: null 
            } 
        };
        // request options
        const options = { 
            method: 'POST',
            url: url,
            headers: { 
                'cache-control': 'no-cache',
                'content-type': 'multipart/form-data' 
            },
            formData: formData
        };

        // make the actual request
        sendRequest(options).then(data => {
            data = JSON.parse(data);
            data.result.message.should.equal(`file stream write success for file: ${fileName}.${fileExtType}`);
            console.log('===== upload to AWS:', data);
            done();
        }).catch(err => {
            done(err);
        });   
    });
});

// test script: readFromAws
describe('readFromAws', function() {
    // add delay before starting each test case
    beforeEach(function (done) {
        setTimeout(function(){
            done();
        }, 500);
    });

    it('get file from AWS', function(done) {
        const url = `${baseUrl}/file/${fileExtType}/${fileName}`;

        // request options
        const options = { 
            method: 'GET',
            url: url,
            headers: { 
                'cache-control': 'no-cache',
            }
        };

        // make the actual request
        sendRequest(options).then(data => {
            data.should.be.equal(fileContent);
            console.log('===== get file from AWS:', data);
            done();
        }).catch(err => {
            done(err);
        });   
    });

    it('list files from AWS', function(done) {
        const url = `${baseUrl}/file/list`;

        // request options
        const options = { 
            method: 'GET',
            url: url,
            headers: { 
                'cache-control': 'no-cache',
            }
        };

        // make the actual request
        sendRequest(options).then(data => {
            data = JSON.parse(data);
            data.result.length.should.be.above(0);
            console.log('===== list files from AWS:', data);
            done();
        }).catch(err => {
            done(err);
        });   
    });
});

// test script: deleteFromAws
describe('deleteFromAws', function() {
    // add delay before starting each test case
    beforeEach(function (done) {
        setTimeout(function(){
            done();
        }, 500);
    });

    it('delete file from AWS', function(done) {
        const url = `${baseUrl}/file/${fileExtType}/${fileName}`;

        // request options
        const options = { 
            method: 'DELETE',
            url: url,
            headers: { 
                'cache-control': 'no-cache',
            }
        };

        // make the actual request
        sendRequest(options).then(data => {
            data = JSON.parse(data);
            data.result.should.be.true;
            console.log('===== delete file from AWS:', data);
            done();
        }).catch(err => {
            done(err);
        });   
    });
});