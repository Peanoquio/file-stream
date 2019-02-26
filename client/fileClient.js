(function() {
    const URL = 'http://127.0.0.1:3001/file';

    let file = null;

    // the progress tag
    const progressTag = document.getElementsByTagName('progress')[0];

    /**
     * Uploads the file
     * @param {*} file 
     */
    const uploadFile = (file) => {
        const fileNameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.'));
        let url = `${URL}/${fileNameWithoutExt}`;
        
        // form data
        const formData = new FormData();
        formData.append('action', 'upload');
        formData.append('filetoupload', file);

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

    // select file field
    const selectfiles = document.getElementById('filetoupload');
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

})();