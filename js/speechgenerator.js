//AUDIO
var audioContext = null;
var meter = null;
var meterCanvas = null;
var averageCanvas = null;
var WIDTH = 500;
var HEIGHT = 10;
var rafID = null;
var volumeArray= [];
var volumeArrayLength = 1000;
var volumeArrayPosition = 0;
var averageVolume = 0;
var level = 100;
var aValue = document.getElementById('avalue');

//TEXT GENERATION
var sourceFile;
var currentString;
var nChars;
var iChar;
var chr;
var target;
var output = [];
var nmatches;
var imatch;
var j;
var phraseNo = 0;

var outputDiv = document.getElementById('outputtext');

//SPEECH SYNTHESIS
var msg;
var voiceSelect = document.getElementById('voice');
var volumeInput = document.getElementById('volume');
var rateInput = document.getElementById('rate');
var pitchInput = document.getElementById('pitch');

/*
The MIT License (MIT)

Copyright (c) 2014 Chris Wilson

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

window.onload = function() {
	//split input string at characters: comma, full stop, exclamation mark, question mark, semicolon, colon
	sourceFile = aliceInWonderland.split(/,|\.|!|\?|;|:/);

	//remove excess whitespace and apostrophes
	for (var i = 0; i < sourceFile.length; i++) {
		sourceFile[i] = sourceFile[i].replace(/'/g, '');
		sourceFile[i] = sourceFile[i].trim();
	}
	console.log(sourceFile);

	//generate inital speech
	generateText(0);

	// grab our canvas
	meterCanvas = document.getElementById( "meter" ).getContext("2d");
	averageCanvas = document.getElementById( "average" ).getContext("2d");

    // monkeypatch Web Audio
    window.AudioContext = window.AudioContext || window.webkitAudioContext;

    //fill volumeArray with 0.001 (not zero)
    for (var i; i < volumeArrayLength; i++) {
    	volumeArray.push(0.001);
	}
}

function didntGetStream(error) {
	console.log(error);
    alert('Stream generation failed. Please try Refreshing the page.');
}

function gotStream(stream) {
    // Create an AudioNode from the stream.
    var mediaStreamSource = audioContext.createMediaStreamSource(stream);

    // Create a new volume meter and connect it.
	meter = createAudioMeter(audioContext);
	mediaStreamSource.connect(meter);

    // kick off the visual updating
    drawLoop();

    //start calculating average volume
    calcAverage();
}

function getAudioStream() {
	// Grab an audio context
	// Since Chrome 70, an audio context will not work without user interaction
	// Since this function is triggered by a button press, we can create it here
	audioContext = new AudioContext();

	navigator.mediaDevices.getUserMedia({ audio: true })
		.then(function(stream) {
			/* use the stream */
			gotStream(stream);
		})
		.catch(function(err) {
			/* handle the error */
			didntGetStream(err);
		});
}

function drawLoop( time ) {
    // clear the background
    meterCanvas.clearRect(0,0,WIDTH,HEIGHT);
    averageCanvas.clearRect(0,0,WIDTH,HEIGHT);

    // check if we're currently clipping
    if (meter.checkClipping())
        meterCanvas.fillStyle = "red";
    else
        meterCanvas.fillStyle = "#E80C76";

    	averageCanvas.fillStyle = "#00FF3D";

    // draw a bar based on the current volume
    meterCanvas.fillRect(0, 0, meter.volume*WIDTH*1.4, HEIGHT);
    //draw a bar based on the average volume
    averageCanvas.fillRect(0, 0, averageVolume*WIDTH*1.4, HEIGHT);

    // set up the next visual callback
    rafID = window.requestAnimationFrame( drawLoop );
}

function createAudioMeter(audioContext,clipLevel,averaging,clipLag) {
	var processor = audioContext.createScriptProcessor(512);
	processor.onaudioprocess = volumeAudioProcess;
	processor.clipping = false;
	processor.lastClip = 0;
	processor.volume = 0;
	processor.clipLevel = clipLevel || 0.98;
	processor.averaging = averaging || 0.95;
	processor.clipLag = clipLag || 750;

	// this will have no effect, since we don't copy the input to the output,
	// but works around a current Chrome bug.
	processor.connect(audioContext.destination);

	processor.checkClipping =
		function(){
			if (!this.clipping)
				return false;
			if ((this.lastClip + this.clipLag) < window.performance.now())
				this.clipping = false;
			return this.clipping;
		};

	processor.shutdown =
		function(){
			this.disconnect();
			this.onaudioprocess = null;
		};

	return processor;
}

function volumeAudioProcess( event ) {
	var buf = event.inputBuffer.getChannelData(0);
    var bufLength = buf.length;
	var sum = 0;
    var x;

	// Do a root-mean-square on the samples: sum up the squares...
    for (var i=0; i<bufLength; i++) {
    	x = buf[i];
    	if (Math.abs(x)>=this.clipLevel) {
    		this.clipping = true;
    		this.lastClip = window.performance.now();
    	}
    	sum += x * x;
    }

    // ... then take the square root of the sum.
    var rms =  Math.sqrt(sum / bufLength);

    // Now smooth this out with the averaging factor applied
    // to the previous sample - take the max here because we
    // want "fast attack, slow release."
    this.volume = Math.max(rms, this.volume*this.averaging);

    //add value to volume array
    if (volumeArrayPosition < volumeArrayLength) {
    	volumeArray[volumeArrayPosition] = this.volume;
    	volumeArrayPosition++;
    }
    else {
    	volumeArrayPosition = 0;
    	volumeArray[volumeArrayPosition] = this.volume;
    }
}

//Markov text generation based on an example found here: http://thinkzone.wlonk.com/Gibber/GibGen.htm

function generateText(number) {
	var lev = level;
	output[number] = "";
	currentString = sourceFile[number];
	console.log("input string: " + currentString);
	nChars = currentString.length;
	currentString = currentString + " " + currentString;

	//check input length
	if (nChars < lev) {
		lev = nChars;
	}

	//choose starting character
	ichar = 0;
	chr = currentString.charAt(ichar);

	//write starting characters
	output[number] = output[number] + currentString.substring(ichar, ichar + lev);

	//set target string
	target = currentString.substring(ichar + 1, ichar + lev);

	for (var i = 0; i < sourceFile[number].length - lev; i++) {
		if (lev == 1) {
			//pick a random character
			chr = currentString.charAt(Math.floor(nChars * Math.random()));
		}
		else {
			//find all sets of matching target characters
			nmatches = 0;
			j = -1;
			while (true) {
				j = currentString.indexOf(target, j + 1)
				if (j < 0 || j >= nChars) {
					break;
				}
				else {
					nmatches++;
				}
			}
			//pick a match at random
			imatch = Math.floor(nmatches * Math.random());

			//find the character following the matching characters
			nmatches = 0;
			j = -1;
			while(true) {
				j = currentString.indexOf(target, j + 1);
				if (j < 0 || j >= nChars) {
					break
				}
				else if (imatch == nmatches) {
					chr = currentString.charAt(j + lev - 1)
					break
				}
				else {
					nmatches++;
				}
			}
		}
		//output the character
		output[number] = output[number] + chr;

		//update the target
		if (lev > 1) {
			target = target.substring(1, lev - 1) + chr;
		}
	}
	return;
}

//calculate the average volume for the previous 5 seconds
function calcAverage() {
setTimeout(function () {
	var len = volumeArray.length;
	var a = parseFloat(aValue.value);
	var total = 0;

	//add together contents of volume array
    for (var i = 0; i < len; i++) {
    	total += volumeArray[i];
    }

    //calulate mean volume
    averageVolume = total / len;

    //empty volume array, reset total
    total = 0;

    //Math.ceil rounds up to integer, preventing a level value of 0
    level = Math.ceil(a/averageVolume);

    //display current level
   	document.getElementById("nlevel").innerHTML="Current Level: " + level;

    calcAverage();

}, 100);
}

// Fetch the list of voices and populate the voice options.
function loadVoices() {
  	// Fetch the available voices.
	var voices = speechSynthesis.getVoices();

 	// Loop through each of the voices.
	voices.forEach(function(voice, i) {
    	// Create a new option element.
		var option = document.createElement('option');

    	// Set the options value and text.
		option.value = voice.name;
		option.innerHTML = voice.name;

    	// Add the option to the voice selector.
		voiceSelect.appendChild(option);
	});
}

// Execute loadVoices.
loadVoices();

// Chrome loads voices asynchronously.
window.speechSynthesis.onvoiceschanged = function(e) {
  loadVoices();
};

// Create a new utterance for the specified text and add it to the queue
function speak(text) {
	// Create a new instance of SpeechSynthesisUtterance.
	msg = new SpeechSynthesisUtterance();

	// Set the text.
	msg.text = text;

	//display the text in the output area
	outputDiv.innerHTML += "<p>" + text + "</p>";
	outputDiv.scrollTop = outputDiv.scrollHeight;

	// Set the attributes.
	msg.volume = parseFloat(volumeInput.value);
	msg.rate = parseFloat(rateInput.value);
	msg.pitch = parseFloat(pitchInput.value);

	// If a voice has been selected, find the voice and set the utterance instance's voice attribute.
	if (voiceSelect.value) {
		msg.voice = speechSynthesis.getVoices().filter(function(voice) { return voice.name == voiceSelect.value; })[0];
	}

	//queue this utterance.
	window.speechSynthesis.speak(msg);

	//generate next phrase
	if (phraseNo < (sourceFile.length - 1)) {
		msg.onend = function(event) {
			setTimeout(function(){
				phraseNo++;
				generateText(phraseNo);
				speak(output[phraseNo]);
			},200);
		};
	}
}