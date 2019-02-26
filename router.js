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


/**
 * Just for testing
 */
router.get('/', (req, res) => {
    res.send('Hello from the other world!!!');
});

/**
 * Upload the file based on the name
 * The most important part is that the Request object should have the <file> property where its <buffer> contains the actual binary data of the file
 */
router.post('/file/:name', upload.single('filetoupload'), async (req, res) => {
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
                const fileExt = file.originalname.substring(file.originalname.lastIndexOf('.'));
                file.newname = `${params.name}${fileExt}`;

                postResult = await fileUtil.streamFileWrite(file.buffer, file.newname, { 
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
 * Get the file based on the extension type and file name
 */
router.get('/file/:extType/:name', async (req, res) => {
    const params = req.params;
    const data = req.body;

    console.log('params:', params);
    console.log('data:', data);

    let getResult = null;
    let getError = null;

    try {
        data.action = ACTIONS.DOWNLOAD;
        data.filename = `${params.name}.${params.extType}`;

        if (!data.filename || data.filename === '') {
            throw new Error(`No file name provided`);
        }
        getResult = await fileUtil.streamFileRead(data.filename, { 
            response: res, 
            request: req, 
            awsParams: { Bucket: configJson.AWS_BUCKET_NAME }
        });

    } catch (err) {
        getError = err;
        console.error(`getError`, getError);
    } finally {
        if (getError) {
            res.json({ error: getError });
        }
    }
});

/**
 * Delete the file based on the extension type and file name
 */
router.delete('/file/:extType/:name', async (req, res) => {
    const params = req.params;
    const data = req.body;

    console.log('params:', params);
    console.log('data:', data);

    let delResult = null;
    let delError = null;

    try {
        data.action = ACTIONS.DELETE;
        data.filename = `${params.name}.${params.extType}`;

        if (!data.filename || data.filename === '') {
            throw new Error(`No file name provided`);
        }

        delResult = await fileUtil.deleteFiles([ data.filename ], {
            awsParams: { Bucket: configJson.AWS_BUCKET_NAME }
        });

    } catch (err) {
        delError = err;
        console.error(`delError`, delError);
    } finally {
        res.json({ result: delResult, error: delError });
    }
});

/**
 * List all the files
 */
router.get('/file/list', (req, res) => {
    
});


module.exports = router;