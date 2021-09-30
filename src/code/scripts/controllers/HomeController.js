import interpretGS1scan from "../utils/interpretGS1scan/interpretGS1scan.js";
import tm from "../../tm.js";
const {WebcController} = WebCardinal.controllers;
const {constants, THREE, PLCameraConfig} = window.Native.Camera;

const apiKey = "3efa4044-3638-4c97-8c57-d94f4ad7ba3d";
const installId = "MTda17VfnVpZdrtPEun66aRYX5C2hT3qoYvhYJDbCaNxSjNxKiMoSG6CP2isWuooTbyh6AyD9B2J3vryV1";

class AuthFeatureError {
    code = 0;
    message = undefined;

    constructor(error){
        if (typeof error === 'string'){
            this.code = 1;
            this.message = error;
        } else {
            this.code = error.code;
            this.message = error.message;
        }
    }
}

class AuthFeatureResponse  {
    status = false;
    error = undefined;

    constructor(status, error) {
        this.status = status;
        this.error = error ? new AuthFeatureError(error) : undefined;
    }
}

/**
 * https://stackoverflow.com/questions/901115/how-can-i-get-query-string-values-in-javascript
 * @param query
 * @returns {*}
 */
const getQueryStringParams = () => {

    const parseQuery = function(query){
        return query.split("?").slice(1).join('?')
    }

    const query = parseQuery(window.frameElement.src);
    return query
        ? (/^[?#]/.test(query) ? query.slice(1) : query)
            .split('&')
            .reduce((params, param) => {
                    let [key, value] = param.split('=');
                    params[key] = value ? decodeURIComponent(value.replace(/\+/g, ' ')) : '';
                    return params;
                }, {}
            )
        : {}
};

const getProductInfo = function(gtin, callback){
    const gtinResolver = require('gtin-resolver');
    const keySSI = gtinResolver.createGTIN_SSI('epi', 'epi', gtin);
    const resolver = require('opendsu').loadApi('resolver');
    resolver.loadDSU(keySSI, (err, dsu) => {
        if (err)
            return callback(err);
        dsu.readFile('product/product.json', (err, product) => {
            if (err)
                return callback(err);
            try{
                product = JSON.parse(product);
            } catch (e) {
                return callback(e);
            }
            callback(undefined, product);
        });
    })
}

const getBatchInfo = function(gtin, batchNumber,  callback){
    const gtinResolver = require('gtin-resolver');
    const keySSI = gtinResolver.createGTIN_SSI('epi', 'epi', gtin, batchNumber);
    const resolver = require('opendsu').loadApi('resolver');
    resolver.loadDSU(keySSI, (err, dsu) => {
        if (err)
            return callback(err);
        dsu.readFile('batch/batch.json', (err, batch) => {
            if (err)
                return callback(err);
            try{
                batch = JSON.parse(batch);
            } catch (e) {
                return callback(e);
            }
            callback(undefined, batch);
        });
    })
}

function compareY (a, b) {
    if (a.y < b.y) {
        return -1;
    }
    if (a.y > b.y) {
        return 1;
    }
    return 0;
}
  
function compareX (a, b) {
    if (a.x < b.x) {
        return -1;
    }
    if (a.x > b.x) {
        return 1;
    }
    return 0;
}

function dataURLtoFile(dataurl, filename) {
    var arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
        bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, {type: mime});
}

export default class HomeController extends WebcController{
    elements = {};
    takenPictures = [];
    cropPictures = [];
    images = [];
    files = [];
    ticketNumber = null;

    constructor(element, history, ...args) {
        super(element, history, ...args);
        // Initiating core
        const gs1Data = getQueryStringParams();
        this.model.gs1Data = gs1Data;
        const self = this;
        
        // Initiating TrueMed related
        this.takingPicture = false;
        this.callback = null;
        this.targetMarker = null;
        this.targetHeight = 48;
        this.targetWidth = 45;
        this.targetX = 50;
        this.targetY = 50;
        this.targetError = false;
        this.reticleError = false;
        this.x = 0;
        this.y = 0;
        this.progress = 0;
        this.imageIndex = 0;
        this.centerPos = 0.5;
        this.centerMove = 0.12;
        this.centerOffsets = [
            {x: 0, y: 0},
            {x: 1, y: -1},
            {x: 1, y: 1},
            {x: -1, y: 1},
            {x: -1, y: -1}
        ];
        this.topBotRatio = 1;
        this.leftRightRatio = 1;
        this.showSpirit = true;


        this.onTagClick('send', () => {
            this.sendForAnalysis();
        })

        // Retrieve product based on code
        getProductInfo(gs1Data.gtin, (err, product) => {
            if (err)
                console.log(`Could not read product info`, err);
            else
                self.model.product = product;
            getBatchInfo(gs1Data.gtin, gs1Data.batchNumber, (err, batch) => {
                if (err)
                    console.log(`Could not read batch data`, err);
                else
                    self.model.batch = batch;
            });
        });

        // Camera related inits
        this.Camera = window.Native.Camera;
        this.Camera.registerHandlers(
            this.onFramePreview.bind(this),
            this.onFrameGrabbed.bind(this),
            this.onPictureTaken.bind(this)
        )
        this.elements.cameraPreview = this.element.querySelector('#camera-preview');
        this.elements.canvas = this.element.querySelector('#cvCanvas');
        this.elements.spiritHorizontal = this.element.querySelector('#spirit-horizontal');
        this.elements.spiritVertical = this.element.querySelector('#spirit-vertical');
        
        this.elements.targetBox = this.element.querySelector('#box');
        this.elements.targetBox.style.width = this.targetWidth + "%";
        this.elements.targetBox.style.height = this.targetHeight + "%";
        
        this.elements.target = this.element.querySelector('#target-marker');
        this.elements.target.style.opacity = 0;

        this.elements.progressCircle = this.element.querySelector('.progress-ring__circle');
        var radius = this.elements.progressCircle.r.baseVal.value;
        this.circumference = radius * 2 * Math.PI;

        this.elements.progressCircle.style.strokeDasharray = `${this.circumference} ${this.circumference}`;
        this.elements.progressCircle.style.strokeDashoffset = `${this.circumference}`;
        
        for(let i = 1; i < 6; i++){
            let selector = '#taken-picture-'+i;
            this.takenPictures.push(this.element.querySelector(selector));
        }

        for(let i = 1; i < 6; i++){
            let selector = '#crop-picture-'+i;
            this.cropPictures.push(this.element.querySelector(selector));
        }
        
        this.elements.maskCanvas = this.element.querySelector('#maskCanvas');
        this.elements.cropView = this.element.querySelector('#crop-view');
        this.elements.sendBtn = this.element.querySelector('#send-btn');

        const config = new PLCameraConfig("photo",
            "torch", true, true,
            ["wideAngleCamera"], "back",
            true, null,
            1);

        this.Camera.nativeBridge.startNativeCameraWithConfig(
            config,
            this.onFramePreview.bind(this),
            25,
            360,
            this.onFrameGrabbed.bind(this),
            10,
            () => {
                console.log("Camera on");
                //this.elements.cameraPreview.src = `${this.Camera.cameraProps._serverUrl}/mjpeg`;
                //this.runProcessing();
            },
            0,
            0,
            0,
            0,
            false);
        
    }

    runProcessing(){
        

        // TODO: Try this instead
        // window.requestAnimationFrame(this.timerCallback)
        /*
        this.callback = setTimeout(() => {
            this.getFrame();
            this.runProcessing();
        }, 100);
        */
    }

    onFrameGrabbed(plImage, elapsedTime){

    }

    

    placeUint8RGBArrayInCanvas(canvasElem, array, w, h) {
        let a = 1;
        let b = 0;
        canvasElem.width = w;
        canvasElem.height = h*3/4; //NOTE: This might be incorrect. However, it does seem like the output height does not match reality.
        const ctx = canvasElem.getContext('2d');
        const clampedArray = new Uint8ClampedArray(w*h*4);
        let j = 0
        for (let i = 0; i < 3*w*h; i+=3) {
            clampedArray[j] = b+a*array[i];
            clampedArray[j+1] = b+a*array[i+1];
            clampedArray[j+2] = b+a*array[i+2];
            clampedArray[j+3] = 255;
            j += 4;
        }
        const imageData = new ImageData(clampedArray, w, h);
        ctx.putImageData(imageData, 0, 0);
    }

    onFramePreview(rgbImage, elapsedTime) {
        this.placeUint8RGBArrayInCanvas(this.elements.canvas, new Uint8Array(rgbImage.arrayBuffer), rgbImage.width, rgbImage.height);

        let context = this.elements.canvas.getContext("2d");
        let imgData = context.getImageData(0, 0, this.elements.canvas.width, this.elements.canvas.height);
        

        // Then, construct a cv.Mat:
        let src = cv.matFromImageData(imgData);
        var size = new cv.Size(src.cols, src.rows);
  
        // Apply edges
        // let edges = tm.getMergedEdges(src)
        let edges = tm.getEdges(src);
  
        // Apply contours
        let contours = tm.getContoursForEdges(edges);
  
        // Find largest shapes if any discovered
        if (contours.size() > 0) {
          let bounds = new cv.Rect(5, 5, size.width - 5, size.height - 5);
          let verticalBounds = true;
          let horizontalBounds = true;
          let largestContours = tm.getLargestContourIDs(contours, bounds, verticalBounds, horizontalBounds);
          let contourArray = [contours.get(largestContours[0]), contours.get(largestContours[1])];
  
          // Create frame data, this provides all information for analysis
          var frame = new tm.FrameData(contourArray, size);
  
          // If we found large contours
          if (largestContours.length > 0) {
            // Size of box
            let rect = cv.minAreaRect(contours.get(largestContours[0]));
            let boundingRect = cv.RotatedRect.boundingRect(rect);
  
            let relativeBoxWidth = boundingRect.width / size.width * 100;
            let relativeBoxHeight = boundingRect.height / size.height * 100;
  
            // Coarse check is used to establish if we should display the target marker and assume the user has found a box
            let coarseBoxSizeErrorMargin = 20;
            let coarseSizeOK = relativeBoxWidth > this.targetWidth - coarseBoxSizeErrorMargin &&
                            relativeBoxWidth < this.targetWidth + coarseBoxSizeErrorMargin &&
                            relativeBoxHeight > this.targetHeight - coarseBoxSizeErrorMargin &&
                            relativeBoxHeight < this.targetHeight + coarseBoxSizeErrorMargin;
  
            if (coarseSizeOK) {
                this.elements.target.style.opacity = 1;
            } else {
                this.elements.target.style.opacity = 0;
            }
  
            // More strict size check, this limits when phone will actually be allowed to take a picture
            let boxSizeErrorMargin = 5
            let sizeOK = relativeBoxWidth > this.targetWidth - boxSizeErrorMargin &&
                          relativeBoxWidth < this.targetWidth + boxSizeErrorMargin &&
                          relativeBoxHeight > this.targetHeight - boxSizeErrorMargin &&
                          relativeBoxHeight < this.targetHeight + boxSizeErrorMargin;
  
            // Debug data section, clear out later.
            let corners = tm.getCornersForContour(contours.get(largestContours[0]));
            if (corners != null) {
              let tmp = new cv.Mat();
              cv.cvtColor(edges, edges, cv.COLOR_GRAY2RGB, 0);
  
              let points = [];
              for (let i = 0; i < corners.size(); ++i) {
                const ci = corners.get(i);
                for (let j = 0; j < ci.data32S.length; j += 2) {
                  let p = {};
                  p.x = ci.data32S[j];
                  p.y = ci.data32S[j + 1];
                  points.push(p);
                }
              }
  
              if (points.length === 4) {
                // console.log(points)
                // Sort points so topmost points are first
                points.sort(compareY);
  
                // Top/Bottom edges comparison
                let topEdgeLength = Math.abs(points[0].x - points[1].x);
                let botEdgeLength = Math.abs(points[2].x - points[3].x);
  
                // If above 1, top side is bigger
                this.topBotRatio = topEdgeLength / botEdgeLength;
                let clampedProgressTB = Math.min(Math.max(this.topBotRatio, 0), 2);
                let percentageTB = (clampedProgressTB / 2 * 100 - 50) * 4;
                this.elements.spiritVertical.style.transform = "translate(50%, "+percentageTB+"%)";
  
                // Sort points so that leftmost points are first
                points.sort(compareX);
  
                // Left/Right edges comparison
                let leftEdgeLength = Math.abs(points[0].y - points[1].y);
                let rightEdgeLength = Math.abs(points[2].y - points[3].y);
  
                // If above 1, left side is bigger
                this.leftRightRatio = leftEdgeLength / rightEdgeLength;
                let clampedProgressLR = Math.min(Math.max(this.leftRightRatio, 0), 2);
                let percentageLR = (clampedProgressLR / 2 * 100 - 50) * 4;
                this.elements.spiritHorizontal.style.transform = "translate("+percentageLR+"%, 50%)";
              }
  
              cv.drawContours(edges, corners, -1, new cv.Scalar(255, 0, 0), 4, 8, tmp, 0)
              corners.delete();
              tmp.delete();
            }
            // cv.polylines(edges, [corners], true, new cv.Scalar(0, 0, 255), 1, cv.LINE_AA)
            // End of debug
  
            // Section: AR target, targeting box positioning and position OK check
            let center = frame.getCenter();
            let currentTargetOffset = this.centerOffsets[this.imageIndex];
            center.x = center.x + currentTargetOffset.x * this.centerMove;
            center.y = center.y + currentTargetOffset.y * this.centerMove;
  
            this.targetX = 50 + currentTargetOffset.x * this.centerMove * 100 * -1;
            this.targetY = 50 + currentTargetOffset.y * this.centerMove * 100 * -1;

            this.elements.targetBox.style.top = this.targetY + "%";
            this.elements.targetBox.style.left = this.targetX + "%";
  
            this.x = center.x * 100 - 50;
            this.y = center.y * 100 - 50;
  
            this.elements.target.style.transform = 'translate(' + this.x + '%, ' + this.y + '%)';
  
            if(!this.takingPicture){

                // Let's see if our camera is centered to the target
                let positionOK = center.x < 0.52 && center.x > 0.48 && center.y < 0.52 && center.y > 0.48;
    
                // Section: Angle check
                let angle = frame.getAngle();
                let angleOK = false;
                let angleDirectionRight = null;
                let angleThreshold = 3.5;
    
                if (angle > 45 && angle < 90 - angleThreshold) {
                    angleDirectionRight = true;
                } else if (angle <= 45 && angle > angleThreshold) {
                    angleDirectionRight = false;
                } else {
                    angleOK = true;
                }
    
                // Layered error handling
                // We start with angle check
                if (positionOK && !angleOK) {
                    this.reticleError = true;
                    this.targetError = false;
                } else {
                    this.reticleError = false;
    
                    // Distance check
                    if (positionOK && !sizeOK) {
                        this.targetError = true;
    
                    // TODO: Add distinctive effects for when target is far away and when target is too close
                    } else {
                        this.targetError = false;
                    }
                }

                if(this.targetError){
                    this.elements.targetBox.style['border-color'] = 'red';
                }else{
                    this.elements.targetBox.style['border-color'] = 'white';
                }
    
                // TODO: Standardize this to a set timing async routine and account for aspect ratios
                if (positionOK && sizeOK && angleOK) {
                    this.progress += 100 / 60 * 3;
                    if (this.progress > 100) {
                        console.log('progress is 100');
                        this.progress = 100;
                        this.takePicture().then(() => {
                            console.log('boom');
                        });
                    }
                } else {
                    this.progress = 0;
                }

                const offset = this.circumference - this.progress / 100 * this.circumference;
                this.elements.progressCircle.style.strokeDashoffset = offset;
            }
          }
        }
  
        // Render debug
        //cv.imshow('cvCanvas', edges)
  
        // Clean memory
        src.delete();
        edges.delete();
        // Access the image as data
        // let image = this.canvas.toDataURL('image/png')
        // console.log(image)
        
    }

    async takePicture(){
        this.takingPicture = true;
        await this.Camera.takePicture("mjpeg");
    }

    onPictureTaken(base64ImageData){
        this.images.push(base64ImageData);
        this.takingPicture = false;
        this.progress = 0;
        this.takenPictures[this.imageIndex].src = base64ImageData;
        //let self = this;
        //let index = this.imageIndex;
        //setTimeout(function(){ self.cropProcess(index); }, 100);

        this.imageIndex++;
        if (this.imageIndex > 4) {
            this.Camera.closeCameraStream();
            this.imageIndex = 0;
            this.elements.cropView.style.display = "block";
            //this.elements.sendBtn.style.display = "block";
            this.cropProcess(0);
        }
        
    }

    // Loops itself until it has processed all images
    async cropProcess(index) {
            var image = new Image();
            let self = this;
            image.onload = function() {
                self.processPhoto(image, index).then(()=>{
                    if(index+1 < self.images.length){
                        self.cropProcess(index+1);
                    }else{
                        console.log("Done");
                        //self.sendForAnalysis();
                        self.elements.sendBtn.style.display = "block";
                    }
                });
            };
            image.src = this.images[index];
    }

    async processPhoto(image, index){
        this.elements.canvas.width = image.width;
        this.elements.canvas.height = image.height;
        let context = this.elements.canvas.getContext("2d");
        context.drawImage(image, 0, 0);
        let imgData = context.getImageData(0, 0, this.elements.canvas.width, this.elements.canvas.height);
        
        // Then, construct a cv.Mat:
        let srcFull = cv.matFromImageData(imgData);
        let src = cv.matFromImageData(imgData);

        let top = 0;
        let left = 0;
        let right = srcFull.cols-1;
        let bottom = srcFull.rows-1;

        let width = Math.floor(src.cols/8);
        let height = Math.floor(src.rows/8);
        var size = new cv.Size(width, height);
        cv.resize(src, src, size, 0, 0, cv.INTER_AREA);

        // Apply edges
        // let edges = tm.getMergedEdges(src)
        let edges = tm.getEdges(src);

        // Apply contours
        let contours = tm.getContoursForEdges(edges);
        edges.delete();
        // Find largest shapes if any discovered
        if (contours.size() > 0) {
            let bounds = new cv.Rect(5, 5, size.width - 5, size.height - 5);
            let verticalBounds = true;
            let horizontalBounds = true;
            let largestContours = tm.getLargestContourIDs(contours, bounds, verticalBounds, horizontalBounds);

            // If we found large contours
            if (largestContours.length > 0) {
                
                // Debug data section, clear out later.
                let corners = tm.getCornersForContour(contours.get(largestContours[0]));
                if (corners != null) {
                    //cv.cvtColor(edges, edges, cv.COLOR_GRAY2RGB, 0);
        
                    let points = [];
                    for (let i = 0; i < corners.size(); ++i) {
                        const ci = corners.get(i);
                        for (let j = 0; j < ci.data32S.length; j += 2) {
                            let p = {};
                            p.x = ci.data32S[j];
                            p.y = ci.data32S[j + 1];
                            points.push(p);
                        }
                    }
                    // Sort points so topmost points are first
                    points.sort(compareY);
                    top = points[0].y;
                    bottom = points[points.length-1].y;
        
                    // Sort points so that leftmost points are first
                    points.sort(compareX);
                    left = points[0].x;
                    right = points[points.length-1].x;
                    
                    let safeMargin = 100; //100 px safety margin

                    left = left*8 - safeMargin;
                    top = top*8 - safeMargin;
                    right = right*8 + safeMargin;
                    bottom = bottom*8 + safeMargin;

                    /* Nifty for corner debugs
                    let tl = new cv.Point(left, top);
                    let tr = new cv.Point(right, top);
                    let bl = new cv.Point(left, bottom);
                    let br = new cv.Point(right, bottom);
                    */
                    let black = new cv.Scalar(0, 0, 0, 255);

                    // Masking
                    cv.rectangle(srcFull, new cv.Point(0, 0), new cv.Point(left, srcFull.rows-1), black, -1);
                    cv.rectangle(srcFull, new cv.Point(0, 0), new cv.Point(srcFull.cols-1, top), black, -1);
                    cv.rectangle(srcFull, new cv.Point(right, 0), new cv.Point(srcFull.cols-1, srcFull.rows-1), black, -1);
                    cv.rectangle(srcFull, new cv.Point(0, bottom), new cv.Point(srcFull.cols-1, srcFull.rows-1), black, -1);
                    /*
                    cv.circle(edges, tl, 10, new cv.Scalar(255, 0, 0), 3);
                    cv.circle(edges, tr, 10, new cv.Scalar(255, 0, 0), 3);
                    cv.circle(edges, bl, 10, new cv.Scalar(255, 0, 0), 3);
                    cv.circle(edges, br, 10, new cv.Scalar(255, 0, 0), 3);
                    */



                    //cv.drawContours(edges, corners, -1, new cv.Scalar(255, 0, 0), 4, 8, tmp, 0)
                    corners.delete();
                }
            }
        }
        cv.transpose(srcFull, srcFull);
        cv.flip(srcFull, srcFull, 0);
        cv.imshow('cvCanvas', srcFull);
        srcFull.delete();
        src.delete();
        
        let finalImg = this.elements.canvas.toDataURL("image/jpeg");
        //this.cropPictures[index].src = finalImg;
        this.files.push(dataURLtoFile(finalImg, index+'.jpg'));
        
    }

    sendForAnalysis(){
        console.log("Send pressed");
        let self = this;

        var data = new FormData();

        for(let i = 0; i < this.files.length; i++){            
            data.append("file", this.files[i]);
        } 
        data.append("device_id", "EPI");
        data.append("latitude", "0");
        data.append("longitude", "0");
        data.append("scan_type", "package");
        data.append("instance_id", "fc86067e-e39d-4807-bca9-9649ca0e45aa");

        var xhr = new XMLHttpRequest();
        xhr.withCredentials = true;

        xhr.addEventListener("readystatechange", function() {
            if(this.readyState === 4) {
                console.log(this.responseText);
                const response = JSON.parse(this.responseText);
                console.log(response);
                if(response.success){
                    self.getTicket(response.data.ticket_number);
                }else{
                    console.log('no success');
                }
            } else {
                console.log(this.readyState);
            }
        });

        

        xhr.addEventListener('progress', function() {
            console.log('progress');
        });
        xhr.addEventListener('error', function() {
            console.log('error');
        });

        xhr.open("POST", "https://api-test.truemed.cloud/v1.0/scan/identify");
        xhr.setRequestHeader('Cache-Control','no-cache');
        xhr.setRequestHeader("X-API-KEY", apiKey);
        xhr.setRequestHeader("X-INSTALL-ID", installId);
        xhr.send(data);
    }

    async waitForResults(){
        /*
        "data": {
            "scan_result": {
                "date_created": "Thu, 30 Sep 2021 09:19:45 GMT",
                "estimated_time": "17.398610277286455",
                "scan_status": "pending",
                "ticket_number": "179eacc7-aad5-4a2d-9a32-8f590d0c994c"
            }
        },
        "success": true
        */

        /*
        "data": {
            "scan_result": {
                "adjusted_score": null,
                "ai_version": "3.2.18r_DEV",
                "aligned_loss_score": "0.0030597220174968243",
                "aligned_ratio_diff_score": "0.012808561325073242",
                "brand": {
                    "name": "Benzatinor",
                    "public_id": "db133391-4134-452a-8e5c-75580ef75ad5"
                },
                "confidence": "100",
                "date_analysed": "Thu, 30 Sep 2021 09:21:31 GMT",
                "date_created": "Thu, 30 Sep 2021 09:19:45 GMT",
                "device_model": "SM-G960FS",
                "diversion": true,
                "estimated_time": "17.398610277286455",
                "expected_result": null,
                "instance": {
                    "active_instance": true,
                    "camera_distance": 0.0,
                    "canny_max": 0,
                    "canny_min": 0,
                    "logo": "/instance_thumbnail/95d906cf-e139-4a7f-8123-116b5a7f870a.png",
                    "metatags": "authentisch,feikkisch",
                    "name": "Benzatinor Grano package_scantrained",
                    "package_diameter": 0.0,
                    "package_height": 78.0,
                    "package_type": "package",
                    "package_width": 58.0,
                    "public_id": "fc86067e-e39d-4807-bca9-9649ca0e45aa",
                    "threshold": 10000.0
                },
                "latitude": 0.0,
                "light_level": 100.0,
                "longitude": 0.0,
                "organization": {
                    "name": "TrueMed Ltd.",
                    "public_id": "e33f0982-f7a0-4322-9824-bed40826e790"
                },
                "product": {
                    "description": "This demo package sold in the US",
                    "name": "Benzatinor demo package",
                    "public_id": "61d78f0c-34e9-47ac-8311-5426d3c90a58"
                },
                "product_source_latitude": null,
                "product_source_longitude": null,
                "ratio_diff_score": "-0.051387906074523926",
                "raw_score": "0.0",
                "raw_score_colour": null,
                "scan_image": "packages/0ab16817-59a3-4d57-ad34-3f73c8be6029",
                "scan_status": "done",
                "scan_type": "package",
                "state": "done",
                "status": "success",
                "ticket_number": "179eacc7-aad5-4a2d-9a32-8f590d0c994c",
                "user": {
                    "first_name": "Hemmo",
                    "last_name": "Latvala",
                    "public_id": "1cf1c3d9-d92c-4af3-9353-245167cf9437"
                }
            }
        },
        */
    }

    getTicket(ticket){
        let self = this;
        var data = JSON.stringify({
            "ticket_number": ticket
        });
        
        var xhr = new XMLHttpRequest();
        xhr.withCredentials = true;
        
        xhr.addEventListener("readystatechange", function() {
            if(this.readyState === 4) {
                const response = JSON.parse(this.responseText);
                const status = response.data.scan_result.scan_status;
                if(status == "pending"){
                    setTimeout(function() {self.getTicket(ticket);}, 2000);
                    //self.getTicket(ticket);
                // Result complete
                }else{
                    const result = response.data.scan_result;
                    //TODO: Catch errors from AI...

                    // Authentic
                    if(result.confidence == 100){
                        self.report(true, undefined);
                    // Counterfeit
                    }else{
                        self.report(false, "Package invalid");
                    }
                }
            }
        });
        
        xhr.open("POST", "https://api-test.truemed.cloud/v1.0/scan/tickets");
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.setRequestHeader('Cache-Control','no-cache');
        xhr.setRequestHeader("X-API-KEY", apiKey);
        xhr.setRequestHeader("X-INSTALL-ID", installId);

        xhr.send(data);
    }


    async verifyPack(){
        const self = this;

        const showError = function(error){
            self.showErrorModal("Authentication Feature", error.message || error);
        }

        await self.scanCode((err, scanData) => {
            if (err)
                return showError(`Could not scan Pack`);
            if (!scanData)
                return console.log(`No data scanned`);
            const isValid = self.verify(scanData);
            self.report(isValid, isValid ? undefined : "Package is not valid");
        });
    }

    async scanCode(callback){
        const self = this;
        await self.barcodeScannerController.present((err, scanData) => err
                ? callback(err)
                : callback(undefined, scanData ? self.parseScanData(scanData.result) : scanData));
    }

    parseScanData(result){
        const interpretedData = interpretGS1scan.interpretScan(result);
        const data = interpretedData.AIbrackets.split(/\(\d{1,2}\)/g);
        result = {
            gtin: data[1],
            expiry: data[2],
            batchNumber: data[3],
            serialNumber: data[4]
        }
        return result;
    }

    verify(scanData){
        const self = this;
        return Object.keys(scanData).every(key => {
            if (key === 'expiry'){
                const dateA = new Date(scanData[key].replace(/(\d{2})(\d{2})(\d{2})/g,'$2/$3/$1')).getTime();
                const dateB = new Date(self.model.gs1Data[key].replaceAll(" - ", "/")).getTime();
                return dateA === dateB;
            }
            return scanData[key] === self.model.gs1Data[key];
        });
    }

    report(status, error){
        const event = new CustomEvent('ssapp-action', {
            bubbles: true,
            cancelable: true,
            detail: new AuthFeatureResponse(status, error)
        });
        this.element.dispatchEvent(event);
    }
}

