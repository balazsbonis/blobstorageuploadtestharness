!function (angular) {
    "use strict";

    var fileUploadService = angular.module('service.FileUpload', []);

    fileUploadService.factory('fileUploadService',
        ['$http', '$q', function ($http, $q) {
            // follow the numbered steps in the comments to get around the flow 

            var maxBlockSize = 1024 * 1024; // 1 Megs
            var totalBytesRemaining = 0;
            var currentFilePointer = 0;
            var currentBlockCounter = 0;
            var uriToUpload = "";
            var fileToUpload = {};
            var retryCounter = 0;
            var reader = new FileReader();
            var mainPromise = {};

            /**
         * Generates the block's id. They need to be of the same length throughout all blocks and be in base64. 
         * @param {Integer} id The integer id of the block
         * @returns {String} The block's id in base64 (000000 -> 999999)
         */
            var calculateBlockId = function (id) {
                return btoa(String("000000" + id).slice(-6));
            }

            /**
             * Gets the SAS token for the file upload
             * @returns {} 
             */
            var setUploadUri = function () {
                var deferred = $q.defer();
                $http
                    .get("/home/getbyid/" + fileToUpload.name + "/")
                    .then(function (result) {
                        if (result.status === 200 || result.status === 201) {
                            console.log("SAS Token refreshed.");
                            uriToUpload = result.data;
                            deferred.resolve(uriToUpload);
                        }
                    });
                return deferred.promise;
            };

            /**
             * Push the instruction data to Blob storage, so it can re-assemble the files from the blocks
             * @returns {} 
             */
            var commitBlockList = function () {
                var uri = uriToUpload + '&comp=blocklist';
                var requestBody = '<?xml version="1.0" encoding="utf-8"?><BlockList>';
                for (var i = 0; i < currentBlockCounter; i++) {
                    requestBody += '<Latest>' + calculateBlockId(i) + '</Latest>';
                }
                requestBody += '</BlockList>';

                var requestParameters = {
                    method: "PUT",
                    url: uri,
                    data: requestBody,
                    ignoreAuthModule: true,
                    headers: {
                        "x-ms-blob-content-type": fileToUpload.type
                    },
                    transformRequest: []
                };

                // 8. step: push the summary for the blocks
                $http(requestParameters)
                    .then(function (data) {
                        console.log(data);
                        mainPromise.resolve(data);
                    }, function (err) {
                        // if it fails to upload at this very last step, we'll just try to refresh the token and reupload it every 5 secs
                        console.log(err);
                        setTimeout(function () {
                            setUploadUri()
                                .then(function () {
                                    commitBlockList();
                                });
                        }, 5000);
                    });
            }

            /**
             * Takes the next block of the data to upload
             * @returns {} 
             */
            var uploadFileInBlocks = function () {

                // 1. step: check if we have more data to upload
                if (totalBytesRemaining > 0) {
                    // 2. step: set the counters and read the next chunk
                    var fileContent = fileToUpload.slice(currentFilePointer, currentFilePointer + maxBlockSize);
                    reader.readAsArrayBuffer(fileContent);
                    retryCounter = 0;
                    currentFilePointer += maxBlockSize;
                    if (totalBytesRemaining < maxBlockSize) {
                        maxBlockSize = totalBytesRemaining;
                    }
                }
                else {
                    // 7. step: assemble all the blocks!!!1!
                    commitBlockList();
                }
            }

            /**
             * Uploads a block of data read from the file
             * @param {Blob} requestData The block of data from the file to upload
             * @returns {} 
             */
            var uploadChunk = function (requestData) {
                // 4. step: get the upload URI
                var uri = uriToUpload + '&comp=block&blockid=' + calculateBlockId(currentBlockCounter);

                var requestParameters = {
                    method: "PUT",
                    url: uri,
                    data: requestData,
                    // don't send the Authorization header with this request, blob storage doesn't accept it
                    ignoreAuthModule: true,
                    headers: {
                        "x-ms-blob-type": "BlockBlob"
                    },
                    // don't parse the binary into JSON, Angular.
                    transformRequest: []
                };

                // 5. step: start uploading the file
                $http(requestParameters)
                    .then(function () {
                        // 6. step /good/: we successfully uploaded the chunk, go to the next bit
                        currentBlockCounter++;
                        totalBytesRemaining -= requestData.length;
                        uploadFileInBlocks();
                    }, function (err) {
                        // 6. step /bad/: something went wrong, fallback
                        retryCounter++;
                        // we retry 5 times in increasing time periods
                        if (retryCounter < 6) {
                            console.log("Warning, upload error, retrying the " + retryCounter + ". time");
                            // let's see if the problem is "only" because our token has expired
                            setTimeout(function () {
                                setUploadUri()
                                    .then(function () {
                                        // try to reupload the last chunk
                                        uploadChunk(requestData);
                                    });
                            }, Math.pow(3, retryCounter - 1) * 5000); // exponentially wait 5s, 15s, 45s, 2:15, and 6:45
                            // all in all 10 minutes and 5 seconds
                        } else {
                            // 6. step /very bad/: you shall not pass.
                            console.log("Failure to upload file.");
                            mainPromise.reject(err);
                        }
                    });
            }

            /**
             * Fires when the filereader finishes reading the current block
             * @param {} evt The event of file reading
             * @returns {} 
             */
            reader.onloadend = function (evt) {
                // 3. step: if we are done reading a chunk, upload it
                if (evt.target.readyState === FileReader.DONE) {
                    var requestData = new Uint8Array(evt.target.result);
                    uploadChunk(requestData);
                }
            };

            return {
                /**
                 * Uploads the given fileObject in blocks to Blob Storage
                 * @param {} fileObject The fileObject
                 * @returns {} 
                 */
                uploadFileInChunks: function (fileObject) {
                    fileToUpload = fileObject;
                    currentBlockCounter = 0;
                    currentFilePointer = 0;
                    totalBytesRemaining = fileObject.size;
                    mainPromise = $q.defer();

                    if (totalBytesRemaining < maxBlockSize) {
                        maxBlockSize = totalBytesRemaining;
                    }

                    setUploadUri().then(function () {
                        uploadFileInBlocks();
                    });

                    return mainPromise.promise;
                },

                bytesRemaining: function () { return totalBytesRemaining; },

                percentUploaded: function () { return 100 - (totalBytesRemaining / fileToUpload.size * 100); }
            }
        }
    ]);

    var fileUploadControllers = angular.module("controller.FileUpload", []);
    fileUploadControllers.controller('fileUploadController', [
        '$rootScope', '$scope', '$http', 'fileUploadService',
        function ($rootScope, $scope, $http, fileUploadService) {

            $scope.queue = {};
            $scope.options = {};
            $scope.percentUploaded = 0;
            $scope.uploadFileInBlocks = function () {
                var fileObject = document.getElementById('file').files[0];
                fileUploadService.uploadFileInChunks(fileObject)
                    .then(function (result) {
                        $scope.queue = {};
                        $scope.percentUploaded = 0;
                    });
            }

            $scope.$watch(fileUploadService.percentUploaded, function (newVal) {
                $scope.percentUploaded = newVal;
            });
        }
    ]);


    // Write your Javascript code.
    var app = angular.module('app', [
        'service.FileUpload',
        'controller.FileUpload'
    ]);

}(angular)