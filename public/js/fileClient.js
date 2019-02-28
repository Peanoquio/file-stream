(function() {
    let URL = '';

    /**
     * Make a server call
     * @param {string} filePath 
     * @param {string} method
     * @param {Function} callback 
     */
    const serverCall = (filePath, method, callback = () => {}) => {
        const xhr = new XMLHttpRequest();
        xhr.open(method, filePath, true);
        xhr.onreadystatechange = () => {
            /*
            Holds the status of the XMLHttpRequest. 
            0: request not initialized 
            1: server connection established
            2: request received 
            3: processing request 
            4: request finished and response is ready
            */
            // 200: "OK"
            if (xhr.readyState === 4 && (xhr.status === 200 || xhr.status === 0)) {
                console.log('AJAX response:', xhr.response);
                if (typeof callback === 'function') {
                    callback(null, xhr.response);
                }
            }
        };
        xhr.send(null);
    };

    // call the server to get the config file
    serverCall('../../config', 'GET', (err, data) => {
        data = JSON.parse(data);

        URL = `http://${data.HTTP_SERVER_IP}:${data.HTTP_SERVER_PORT}`;

        /**
         * List the files/objects from AWS
         */
        const listFilesPromise = () => {
            return new Promise((resolve, reject) => {
                let url = `${URL}/file/list`;
                serverCall(url, 'GET', (err, data) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(data);
                    }
                });
            });
        };

        // the progress tag
        const progressTag = document.getElementsByTagName('progress')[0];

        /**
         * Uploads the file
         * @param {Object} file 
         */
        const uploadFile = (file) => {
            const fileNameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.'));
            let url = `${URL}/file/${fileNameWithoutExt}`;
            
            // form data
            const formData = new FormData();
            formData.append('action', 'upload');
            formData.append(data.FILE_FORM_UPLOAD_FIELD_KEY, file);

            const xhr = new XMLHttpRequest();
            if (xhr.upload) {
                // show the progress of the upload
                xhr.upload.addEventListener('progress', (e) => {
                    console.log(e);
                    if (e.lengthComputable) {
                        progressTag.setAttribute('value', e.loaded);
                        progressTag.setAttribute('max', e.total);
                    }
                } , false);
            }
            // AJAX call
            xhr.open('POST', url, true);
            xhr.onreadystatechange = function() {
                /*
                Holds the status of the XMLHttpRequest. 
                0: request not initialized 
                1: server connection established
                2: request received 
                3: processing request 
                4: request finished and response is ready
                */
                // 200: "OK"
                if (xhr.readyState == 4 && xhr.status == 200) {
                    console.log('AJAX response:', xhr.response);
                }
            };
            xhr.send(formData);
        };

        listFilesPromise().then(results => {
            console.log('listFilesPromise results:', results);
        }).catch(err => {
            console.error('listFilesPromise error:', err);
        });

        let file = null;

        // select file field
        const selectfiles = document.createElement('input');
        selectfiles.setAttribute('type', 'file');
        selectfiles.setAttribute('id', data.FILE_FORM_UPLOAD_FIELD_KEY);
        selectfiles.setAttribute('name', data.FILE_FORM_UPLOAD_FIELD_KEY);
        selectfiles.addEventListener('change', function(e) {
            file = this.files[0];
            console.log('selecting:', file);
            progressTag.removeAttribute('value');
            progressTag.removeAttribute('max');
        }, false);

        // upload file button
        const uploadfiles = document.getElementById('uploadfilebtn');
        uploadfiles.addEventListener('click', function(e) {
            console.log('uploading:', file);
            uploadFile(file);
        }, false);

        // form 
        const myform = document.getElementById('myform');
        myform.appendChild(selectfiles);
    });

})();