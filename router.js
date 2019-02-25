const express = require('express');
const router = express.Router();
const multer  = require('multer')
const upload = multer();

const configJson = require('./config/config.json');
const fileUtil = require('./src/fileUtil');


const ACTIONS = {
    LIST: 'list',
    UPLOAD: 'upload',
    DOWNLOAD: 'download',
    DELETE: 'delete'
};


router.get('/', (req, res) => {
    res.send('Hello from the other world!!!');
});

/**
 * 
 */
router.post('/file/:id', upload.single('filetoupload'), async (req, res) => {
    const params = req.params;
    const data = req.body;
    const file = req.file;
    /*
    file: { 
        fieldname: 'filetoupload',
        originalname: 'test.txt',
        encoding: '7bit',
        mimetype: 'text/plain',
        buffer:
        <Buffer 74 65 73 74 20 74 65 73 74 20 74 65 73 74 20 74 65 73 74 20 74 65 73
        74 20 0d 0a 74 65 73 74 20 74 65 73 74 20 74 65 73 74 20 74 65 73 74 20 74 65 73
        ... >,
        size: 1358 
    }
    */

    console.log('params:', params);
    console.log('data:', data);
    console.log('file:', file);

    let postResult = null;
    let postError = null;

    try {
        switch (data.action) {
            case ACTIONS.UPLOAD:
                if (!file.originalname || file.originalname === '') {
                    throw new Error(`No file name provided`);
                } else if (file.size <= 0) {
                    throw new Error(`File is empty`);
                }
                postResult = await fileUtil.streamFileWrite(file.buffer, file.originalname, { 
                    writeToFile: true, 
                    uploadToAws: true, 
                    awsParams: { Bucket: configJson.AWS_BUCKET_NAME }
                });
                break;
            default:
                postError = new RangeError(`Invalid action: ${data.action}`);
        }
    } catch (err) {
        postError = err;
    } finally {
        res.json({ result: postResult, error: postError });
    }
}); 

/**
 * 
 */
router.get('/file/:id', async (req, res) => {
    const params = req.params;
    const data = req.body;

    console.log('params:', params);
    console.log('data:', data);

    data.action = 'download';
    //data.filename = 'test.txt';
    //data.filename = 'test_image.png';
    data.filename = 'test_video.mp4';

    // TODO:  just for testing
    const fileData = {
        size: 10498677,
        mimetype: 'video/mp4',
        //size: 59992,
        //mimetype: 'image/png',
    };

    let getResult = null;
    let getError = null;

    try {
        switch (data.action) {
            case ACTIONS.DOWNLOAD:
                if (!data.filename || data.filename === '') {
                    throw new Error(`No file name provided`);
                }
                getResult = await fileUtil.streamFileRead(data.filename, { response: res, request: req, writeToFile: true, fileData });
                break;
            default:
                getError = new RangeError(`Invalid action: ${data.action}`);
        }
    } catch (err) {
        getError = err;
    } finally {
        res.json({ result: getResult, error: getError });
    }
});

router.get('/file/all', (req, res) => {
    
});

router.delete('/file/:id', (req, res) => {
    
});


module.exports = router;