const express = require('express');
const router = express.Router();
const multer  = require('multer')
const upload = multer();

const FileUtil = require('./src/fileUtil');


const ACTIONS = {
    LIST: 'list',
    UPLOAD: 'upload',
    DOWNLOAD: 'download',
    DELETE: 'delete'
};


router.get('/', (req, res) => {
    res.send('Hello from the other world!!!');
});

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

    try {
        let result = null;
        switch (data.action) {
            case ACTIONS.UPLOAD:
                if (!file.originalname || file.originalname === '') {
                    throw new Error(`No file name provided`);
                } else if (file.size <= 0) {
                    throw new Error(`File is empty`);
                }
                const fileUtil = new FileUtil();
                result = await fileUtil.compressAndEncrypt(file.buffer, file.originalname);
                break;
            default:
                throw new RangeError(`Invalid action: ${data.action}`);
        }
        res.json( { msg: 'The server got the data', data, result });
    } catch (err) {
        res.json( { msg: 'The server got the data', data, err });
    }
}); 

router.get('/file/:id', (req, res) => {
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

    switch (data.action) {
        case ACTIONS.DOWNLOAD:
            if (!data.filename || data.filename === '') {
                throw new Error(`No file name provided`);
            }
            const fileUtil = new FileUtil();
            fileUtil.streamFileRead(data.filename, { response: res, request: req, writeToFile: true, fileData }).then(result => {
                /*
                res.writeHead(200, {
                    "Content-Type": "text/plain",
                    //"Content-Disposition" : "attachment; filename=prediction_1.txt"
                });
                */
            }).catch(err => {
                console.error(err);
            }); 
            break;
        default:
            throw new RangeError(`Invalid action: ${data.action}`);
    }

    //res.json( { msg: 'The server got the data', data });
});

router.get('/file/all', (req, res) => {
    
});

router.delete('/file/:id', (req, res) => {
    
});


module.exports = router;