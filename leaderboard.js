
// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBwLFCzV7vJi7KPfViDNWHhVhYbgmA3VMI",
  authDomain: "obgyn-7d3ad.firebaseapp.com",
  projectId: "obgyn-7d3ad",
  storageBucket: "obgyn-7d3ad.firebasestorage.app",
  messagingSenderId: "920710361267",
  appId: "1:920710361267:web:9b4e308d986781a4d040c6"
};

// Connect to Firebase
firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

// Sign in anonymously
const authReady = auth.signInAnonymously()
  .then(() => {
    console.log("Firebase login successful!");
    return true;
  })
  .catch(error => {
    console.error("Firebase login error:", error);
    return false;
  });

// Save player name
let playerName = null;
function askPlayerName() {
  if (!playerName) {
    playerName = prompt("Enter your name for the leaderboard:");

    if (!playerName || !playerName.trim()) {
      alert("Please enter your name before starting.");
      playerName = null;
      return false;
    }

    playerName = playerName.trim().slice(0, 30);
    localStorage.setItem("obgPlayerName", playerName);
  }

  return true;
}

// Save completed quiz score
let quizSaved = false;

async function saveQuizScore() {
  if (quizSaved || !playerName) return;

  quizSaved = true;

  try {
    const signedIn = await authReady;

    if (!signedIn || !auth.currentUser) {
      throw new Error("Firebase login failed.");
    }

    const points = Number(S.sc) || 0;
    const playerId = auth.currentUser.uid;
    const playerRef = db.collection("players").doc(playerId);

    await db.runTransaction(async transaction => {
      const playerDoc = await transaction.get(playerRef);

      if (playerDoc.exists) {
        transaction.update(playerRef, {
          name: playerName,
          totalPoints: firebase.firestore.FieldValue.increment(points),
          quizzesCompleted: firebase.firestore.FieldValue.increment(1)
        });
      } else {
        transaction.set(playerRef, {
          name: playerName,
          totalPoints: points,
          quizzesCompleted: 1
        });
      }
    });

    console.log("Quiz score saved!");
  } catch (error) {
    quizSaved = false;
    console.error("Could not save score:", error);
  }
}

// Connect score saving to quiz results
const originalRender = window.R;

window.R = function() {
  originalRender();

  if (window.S && window.S.v === "end") {
    saveQuizScore();
  }
};
