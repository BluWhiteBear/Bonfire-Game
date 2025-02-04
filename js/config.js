export const CONFIG = {
  iceServers: [
    // Free STUN servers
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun.l.google.com:5349" },
    { urls: "stun:stun1.l.google.com:3478" },
    { urls: "stun:stun1.l.google.com:5349" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:5349" },
    { urls: "stun:stun3.l.google.com:3478" },
    { urls: "stun:stun3.l.google.com:5349" },
    { urls: "stun:stun4.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:5349" },
    // Free TURN servers
    {
      urls: 'turn:numb.viagenie.ca',
      username: 'webrtc@live.com',
      credential: 'muazkh'
    },
    {
      urls: 'turn:turn.anyfirewall.com:443?transport=tcp',
      username: 'webrtc',
      credential: 'webrtc'
    }
  ],
  // PeerJS specific options
  debug: 3, // Enables detailed logging
  config: {
    'iceTransportPolicy': 'all', // Try both STUN and TURN
    'iceCandidatePoolSize': 10
  }
};