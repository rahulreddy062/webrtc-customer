var customerViewCustomerVideo = document.querySelector(
  "#customerViewCustomerVideoElement"
);
var customerViewClientVideo = document.querySelector(
  "#customerViewClientVideoElement"
);

//google map
function myMap() {
  var mapProp = {
    center: new google.maps.LatLng(11.0168, 76.9558),
    disableDefaultUI: true,
    fullscreenControl: false,
    zoom: 5,
    zoomControl: true,
    zoomControlOptions: {
      position: google.maps.ControlPosition.TOP_LEFT,
      style: google.maps.ZoomControlStyle.HORIZONTAL_BAR,
    },
    mapTypeControl: true,
    mapTypeControlOptions: {
      style: google.maps.MapTypeControlStyle.DROPDOWN_MENU,
      mapTypeIds: ["roadmap", "terrain"],
    },
  };

  var map = new google.maps.Map(document.getElementById("googleMap"), mapProp);
  var transitLayer = new google.maps.TransitLayer();
  transitLayer.setMap(map);
}

//open or close video call request form
function openCloseVideoCallForm() {
  if (
    document.getElementById("openVideoCallForm").classList.contains("hideElement")
  ) {
    document.getElementById("openVideoCallForm").classList.remove("hideElement");
  } else {
    document.getElementById("openVideoCallForm").classList.add("hideElement");
  }
}

//close the video call request screen while pressing escape key
document.onkeydown = function (evt) {
  evt = evt || window.event;
  var isEscape = false;
  if ("key" in evt) {
    isEscape = evt.key === "Escape" || evt.key === "Esc";
  } else {
    isEscape = evt.keyCode === 27;
  }
  if (
    isEscape &&
    !document
      .getElementById("openVideoCallForm")
      .classList.contains("hideElement")
  ) {
    document.getElementById("openVideoCallForm").classList.add("hideElement");
  }
};

//block texts in input
function onlyNumberKey(evt) {
  // Only ASCII character in that range allowed
  var ASCIICode = (evt.which) ? evt.which : evt.keyCode
  if (ASCIICode > 31 && (ASCIICode < 48 || ASCIICode > 57))
      return false;
  return true;
}

//submit video call request form
function submitForm(event) {
  event.preventDefault();
  let name = document.getElementById("callRequesterName");
  let number = document.getElementById("callRequesterNumber");
  let reason = document.getElementById("callRequestReason");
  console.log(name.value);
  console.log(number.value);
  console.log(reason.value);
  localStorage.setItem("customerName",name.value);
  // close video call request screen
  openCloseVideoCallForm();
  //open loading screen
  openCloseLoadingScreen();
}

//open or close loading screen
function openCloseLoadingScreen() {
  if (
    document
      .getElementById("openLoadingScreen")
      .classList.contains("hideElement")
  ) {
    document.getElementById("openLoadingScreen").classList.remove("hideElement");
    document.getElementsByClassName("loadingContainer")[0].style.display =
      "flex";
    //close the loading screen after some seconds and open video chat
    setTimeout(function () {
      goToVideoChat();
    }, 5000);
  } else {
    document.getElementById("openLoadingScreen").classList.add("hideElement");
    document.getElementsByClassName("loadingContainer")[0].style.display =
      "none";
  }
}

let userMediaStream;

//start video chat
function goToVideoChat() {
  //close the loading screen
  openCloseLoadingScreen();
  document.getElementById("customerViewContainer").classList.remove("hideElement");

  //webrtc starts here
  "use strict";

  const MESSAGE_TYPE = {
    SDP: 'SDP',
    CANDIDATE: 'CANDIDATE',
  }

  const MAXIMUM_MESSAGE_SIZE = 65535;
  const END_OF_FILE_MESSAGE = 'EOF';
  let code = 123456789;
  let peerConnection;
  let signaling;
  const senders = [];
  let userMediaStream;
  let displayMediaStream;
  let file;

  const startChat = async () => {
    try {
      userMediaStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      
      signaling = new WebSocket('wss://videochat-app-bj.herokuapp.com');
      setTimeout(function(){peerConnection = createPeerConnection();

      addMessageHandler();

      userMediaStream.getTracks()
        .forEach(track => senders.push(peerConnection.addTrack(track, userMediaStream)));
      document.getElementById('customerViewCustomerVideoElement').srcObject = userMediaStream},10000)

    } catch (err) {
      console.error(err);
    }
  };
startChat();
  const createPeerConnection = () => {
  
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.m.test.com:19000' }],
    });

    pc.onnegotiationneeded = async () => {
      await createAndSendOffer();
    };

    pc.onicecandidate = (iceEvent) => {
      if (iceEvent && iceEvent.candidate) {
        sendMessage({
          message_type: MESSAGE_TYPE.CANDIDATE,
          content: iceEvent.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      console.log(event);
      const video = document.getElementById('customerViewClientVideoElement');
      video.srcObject = event.streams[0];
      console.log("live streaming");
    };

    pc.ondatachannel = (event) => {
      const { channel } = event;
      channel.binaryType = 'arraybuffer';

      const receivedBuffers = [];
      channel.onmessage = async (event) => {
        const { data } = event;
        try {
          if (data !== END_OF_FILE_MESSAGE) {
            receivedBuffers.push(data);
          } else {
            const arrayBuffer = receivedBuffers.reduce((acc, arrayBuffer) => {
              const tmp = new Uint8Array(acc.byteLength + arrayBuffer.byteLength);
              tmp.set(new Uint8Array(acc), 0);
              tmp.set(new Uint8Array(arrayBuffer), acc.byteLength);
              return tmp;
            }, new Uint8Array());
            const blob = new Blob([arrayBuffer]);
            downloadFile(blob, channel.label);
            channel.close();
          }
        } catch (err) {
          console.log('File transfer failed');
        }
      };
    };

    return pc;
  };

  const addMessageHandler = () => {
    signaling.onmessage = async (message) => {
      const data = JSON.parse(message.data);

      if (!data) {
        return;
      }

      const { message_type, content } = data;
      try {
        if (message_type === MESSAGE_TYPE.CANDIDATE && content) {
          await peerConnection.addIceCandidate(content);
        } else if (message_type === MESSAGE_TYPE.SDP) {
          if (content.type === 'offer') {
            await peerConnection.setRemoteDescription(content);
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            sendMessage({
              message_type: MESSAGE_TYPE.SDP,
              content: answer,
            });
          } else if (content.type === 'answer') {
            await peerConnection.setRemoteDescription(content);
          } else {
            console.log('Unsupported SDP type.');
          }
        }
      } catch (err) {
        console.error(err);
      }
    }
  }

  const sendMessage = (message) => {
      signaling.send(JSON.stringify({
        ...message,
        code,
      }));
  }

  const createAndSendOffer = async () => {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    sendMessage({
      message_type: MESSAGE_TYPE.SDP,
      content: offer,
    });
  }

  //webrtc ends here

}


//end video chat
function endVideoCall() {
  document.getElementById("customerViewContainer").classList.add("hideElement");
  const customerMediaStream = customerViewCustomerVideo.srcObject;
  const customerMediaTracks = customerMediaStream.getTracks();
  //stop all tracks
   customerMediaTracks.forEach((track) => track.stop());
}

// audio change
function audioChange() {
  const customerMediaStream = customerViewCustomerVideo.srcObject;
  const customerMediaTracks = customerMediaStream.getTracks();
  if (
    document.getElementById("myMic").classList.contains("customerViewActive")
  ) {
    //mute mic
    document.getElementById("myMic").classList.add("customerViewInactive");
    document.getElementById("myMic").classList.remove("customerViewActive");
   //remove audio track
    customerMediaTracks.forEach(function(device) {
    if(device.kind === 'audio'){
      device.enabled = false;
      device.muted = true;
    }
    });
  } else {
    //un mute mic
    document.getElementById("myMic").classList.add("customerViewActive");
    document.getElementById("myMic").classList.remove("customerViewInactive");
   //add audio track
    customerMediaTracks.forEach(function(device) {
      if(device.kind === 'audio'){
        device.enabled = true;
        device.muted = false;
      }
      });
  }
}

//video change
function videoChange() {
  const customerMediaStream = customerViewCustomerVideo.srcObject;
  const customerMediaTracks = customerMediaStream.getTracks();
  if (
    document.getElementById("myVideo").classList.contains("customerViewActive")
  ) {
    //mute video
    document.getElementById("myVideo").classList.add("customerViewInactive");
    document.getElementById("myVideo").classList.remove("customerViewActive");
    document.getElementById("customerViewCustomerVideoElement").style.display =
      "none";
    document.getElementById("imageElement").style.display = "";
    document.getElementById("imageElement").classList.remove("hideElement");

    //stop video track
    customerMediaTracks.forEach(function(device) {
      if(device.kind === 'video'){
        device.enabled = false;
        device.muted = true;
      }
      });
  } else {
    //un mute video
    document.getElementById("myVideo").classList.add("customerViewActive");
    document.getElementById("myVideo").classList.remove("customerViewInactive");
    document.getElementById("customerViewCustomerVideoElement").style.display =
      "";
    document.getElementById("imageElement").style.display = "none";

    //add video track
    customerMediaTracks.forEach(function(device) {
      if(device.kind === 'video'){
        device.enabled = true;
        device.muted = false;
      }
      });
  }

//add name to unknown person image
var x = localStorage.getItem("customerName");
document.getElementById("customerName").innerHTML = x;
}
