/**
 * Created by sulvto on 16-1-30.
 */
window.moz = !!navigator.mozGetUserMedia;

var PeerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection ||
        window.webkitRTCPeerConnection || window.msRTCPeerConnection,

    SessionDescription = window.RTCSessionDescription || window.mozRTCSessionDescription ||
        window.webkitRTCSessionDescription || window.msRTCSessionDescription,

    IceCandidate = window.mozRTCIceCandidate || window.RTCIceCandidate;

window.answerer = [];
window.offerer = [];
var RTCDataChannels = [];
var id = null;
var signalingChannel = io();
var SOCKET = {
    sendOfferSdp: function (offerSdp) {
        signalingChannel.emit("RTCDataChannel", {offerSdp: offerSdp, from: window.ID});
    },
    sendAnswerSdp: function (answerSdp) {
        signalingChannel.emit("RTCDataChannel", {answerSdp: answerSdp, from: window.ID});
    },
    sendIce: function (ice, to) {
        signalingChannel.emit("RTCDataChannel", {ice: ice, from: window.ID, to: to});
    }
}

signalingChannel.on("RTCDataChannel", function (data) {
    if (data.from == window.ID) {
        console.log("form me", data.from);
        return;
    }
    var nowDate = new Date();
    // if other user created offer; and sent you offer-sdp
    if (data.offerSdp) {
        if (!window.answerer[data.from]) {
            console.log("====offerSdp====" + nowDate.getMinutes() + " " + nowDate.getMilliseconds(), window.answerer);
            window.answerer[data.from] = {peer: Answerer.createAnswer(data.offerSdp, data.from), addIce: false};
        }
    } else
    // if other user created answer; and sent you answer-sdp
    if (data.answerSdp) {
        if (window.offerer[data.from]) {
            console.log("====answerSdp====" + nowDate.getMinutes() + " " + nowDate.getMilliseconds(), window.offerer);
            window.offerer[data.from].peer.setRemoteDescription(data.answerSdp);
        }
    } else
    // if other user sent you ice candidates
    if (data.ice) {
        // it will be fired both for offerer and answerer
        console.log(data);
        console.log(window.answerer);
        if (data.to) {
            console.log("====ice====" + nowDate.getMinutes() + " " + nowDate.getMilliseconds(), window.answerer);
            window.answerer[data.from].peer.addIceCandidate(data.ice);
        }else{
            if (window.answerer[data.from] && !window.answerer[data.from].addIce) {
                console.log("====ice====" + nowDate.getMinutes() + " " + nowDate.getMilliseconds(), window.answerer);
                window.answerer[data.from].peer.addIceCandidate(data.ice);
                window.answerer[data.from].addIce = true;
            }
        }
    } else {
        console.log(window.answerer);
        console.log(window.offerer);
        if (!window.answerer[data.from]) {
            console.log("====  createOffer   ====" + nowDate.getMinutes() + " " + nowDate.getMilliseconds());
            window.offerer[data.from] = {peer: Offerer.createOffer()};
        }
    }
});

signalingChannel.emit("ID", {});

signalingChannel.on("ID", function (data) {
    window.ID = data.replace("/#", "");
    $("#panel .panel-title").text(ID);
});


//========================================================
var iceServers = {"iceServers": [{"url": "stun:stun.l.google.com:19302"}]};

function failureCallback(data) {
    //TODO error
    console.log(data);
}
var Offerer = {
    createOffer: function () {
        var peer = new PeerConnection(iceServers);

        // send any ice candidates to the other peer
        peer.onicecandidate = function (event) {
            console.log("peer.onicecandidate");
            if (event.candidate) {
                SOCKET.sendIce(event.candidate);
            }
        };

        // let the "negotiationneeded" event trigger offer generation
        peer.onnegotiationneeded = function () {
            console.log("peer.onnegotiationneeded");
        };

        var offererDataChannel = peer.createDataChannel('RTCDataChannel', moz ? {} : {
            reliable: false // Deprecated
        });
        if (moz) {
            offererDataChannel.binaryType = 'blob';
        }
        setChannelEvents(offererDataChannel);
        peer.createOffer(function (sdp) {
            peer.setLocalDescription(sdp);
            SOCKET.sendOfferSdp(sdp);
        }, failureCallback);
        this.peer = peer;
        return this;
    }, setRemoteDescription: function (sdp) {
        this.peer.setRemoteDescription(new SessionDescription(sdp));
    },
    addIceCandidate: function (candidate) {
        this.peer.addIceCandidate(new IceCandidate({
            sdpMLineIndex: candidate.sdpMLineIndex,
            candidate: candidate.candidate
        }));
    }
}

var Answerer = {
    createAnswer: function (offerSDP, to) {
        var peer = new PeerConnection(iceServers);
        peer.ondatachannel = function (event) {
            var answererDataChannel = event.channel;
            if (moz) {
                answererDataChannel.binaryType = 'blob';
            }

            setChannelEvents(answererDataChannel);
        };

        peer.onicecandidate = function (event) {
            if (event.candidate) {
                SOCKET.sendIce(event.candidate, to);
            }
        };

        peer.setRemoteDescription(new SessionDescription(offerSDP));

        peer.createAnswer(function (sdp) {
            peer.setLocalDescription(sdp);
            SOCKET.sendAnswerSdp(sdp);
        }, failureCallback);

        this.peer = peer;
        return this;
    },
    addIceCandidate: function (candidate) {
        this.peer.addIceCandidate(new IceCandidate({
            sdpMLineIndex: candidate.sdpMLineIndex,
            candidate: candidate.candidate
        }));
    }
};

function setChannelEvents(channel) {
    channel.onmessage = function (event) {
        console.log('WebRTC DataChannel onmessage', event);
        onMsg(event.data);
    };

    channel.onopen = function () {
        console.log(channel);
        RTCDataChannels[RTCDataChannels.length] = channel;
        //TODO
        console.log("====ONOPEN====ONOPEN====ONOPEN====ONOPEN====ONOPEN====");
    };
    channel.onclose = function (event) {
        console.warn('WebRTC DataChannel closed', event);
    };
    channel.onerror = function (event) {
        console.error('WebRTC DataChannel error', event);
    };
}


function channelSend(data) {
    var length = RTCDataChannels.length;

    for (var i = 0; i < length; i++) {
        var channel = RTCDataChannels[i];
        if (channel.readyState == 'open') {
            channel.send(data);
        }
    }
}

//=====================================================================

//TODO temp
var start = window.setInterval(function () {
    if (window.ID) {
        var nowDate = new Date();
        console.log("====  send from   ====" + nowDate.getMinutes() + " " + nowDate.getMilliseconds());

        signalingChannel.emit("RTCDataChannel", {from: window.ID});
        clearInterval(start);
    }
}, 3000);

function showMsgToPanel(message, me) {
    if (me) {
        $("#panel .panel-body").append("<p class='text-right'>" + message + "</p>")
    } else {
        $("#panel .panel-body").append("<p class='text-left'>" + message + "</p>")
    }
}

function onMsg(msg) {
    if (msg) {
        showMsgToPanel(msg, false);
    }
}
function sendMsg() {
    var msg = $("#input").val();
    channelSend(msg);
    showMsgToPanel(msg, true);
    $("#input").val("");
}

window.setInterval(function () {
    console.log("RTCDataChannels :: " + RTCDataChannels.length);
}, 10000);