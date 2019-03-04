# file-stream
A NodeJS REST API HTTP server that supports the following:
* Retrieves a list of files from AWS S3 bucket
* Retrieves a specific file based on an appropriate unique identifier
* Upload a single file into S3 bucket
* Remove specific file from S3 bucket

## Technical Overview

For this REST API server, NodeJS was used since it handles asynchronous IO very well especially when we read/write files either to the local directory or a remote server such AWS S3.
Moreover, this implementation makes use of pipes and streaming so that buffered data will be sent/received in byte chunks instead of waiting for the whole file to be loaded in memory.
The module `FileUtil` manages:
* file encryption/decryption for security when we upload/download files
* file compression/extraction to save on storage
* file streaming in byte chunks for optimization and better user experience
* option to read from / write to local directory
The module `AwsUtil` manages:
* performing read/write operations on AWS S3


## Prerequisites

You need to have an AWS S3 account together with the corresponding access key id and secret access key


## Usage

How this works:
* Set various configurations (eg. server port, AWS access keys, etc.), you can edit the config file parameters in the config directory
* Navigate to the root project directory then run `npm install` to install the npm modules
* Start the REST API HTTP server by typing this on the command line terminal: `node server.js` (NOTE: you can also use pm2 clustering) 


## Tool and Testing

* To access and use the tool to make various REST calls, enter this URL in the web browser:
```
http://127.0.0.1:3001/view/fileClient.html
```
* To run the unit tests for the REST API calls, enter this in the command line terminal: `npm test`


## REST API Endpoints

Once the server is up and running, you can make HTTP requests to these end points
* Upload a file into the AWS S3 bucket <br />
**POST** request parameters: <br />
`name`: the unique identifier of the file to be uploaded
```
http://127.0.0.1:3001/file/:name
```
* Retrieve a file from the AWS S3 bucket based on the specified identifier <br />
**GET** request parameters: <br />
`name`: the unique identifier of the file to be uploaded <br />
`extType`: the extension / mime type of the file (eg. txt, png, mp4, etc.)
```
http://127.0.0.1:3001/file/:extType/:name
```
* Delete a file from the AWS S3 bucket based on the specified identifier <br />
**DELETE** request parameters: <br />
`name`: the unique identifier of the file to be uploaded <br />
`extType`: the extension / mime type of the file (eg. txt, png, mp4, etc.)
```
http://127.0.0.1:3001/file/:extType/:name
```
* Retrieve the list of files from the AWS S3 bucket <br />
**GET** request
```
http://127.0.0.1:3001/file/list
```

## Dependencies

The code dependencies can be found in the npm modules list in this file [package.json](package.json) 

## License

This is an open source project. For more information, please refer to [LICENSE](LICENSE) 
