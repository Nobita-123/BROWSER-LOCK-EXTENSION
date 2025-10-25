// Hashing function for password
async function hashPassword(password) {
  if (!password) return null;
  const textEncoder = new TextEncoder();
  const data = textEncoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

document.addEventListener("DOMContentLoaded", loadQuestion);

// Updated showMessage function to use the new message-box styling
function showMessage(text, type = "error") {
  const messageEl = document.getElementById("message-box");
  messageEl.textContent = text;
  // Clear existing type classes before adding new one
  messageEl.classList.remove('error', 'success'); 
  messageEl.classList.add(type, 'show'); // Add 'show' class to fade in
}

function loadQuestion() {
  chrome.runtime.sendMessage({ action: "getSecurityQuestion" }, function (response) {
    if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError.message);
        showMessage("Error loading security question.", "error");
        return;
    }
    const questionDisplay = document.getElementById("question-display");
    if (response && response.question) {
      questionDisplay.textContent = response.question;
    } else {
      questionDisplay.textContent = "No security question found. Please set one in options.";
      document.getElementById("verify").disabled = true;
      showMessage("Please set a security question in the options page.", "error");
    }
  });
}

document.getElementById("verify").addEventListener("click", function () {
  const answer = document.getElementById("answer").value;
  if (!answer) {
    showMessage("Please enter your answer.", "error");
    return;
  }
  
  chrome.runtime.sendMessage(
    { action: "verifySecurityAnswer", answer: answer },
    function (response) {
      if (chrome.runtime.lastError) {
          console.error(chrome.runtime.lastError.message);
          showMessage("Error verifying answer.", "error");
          return;
      }
      if (response && response.success) {
        showMessage("Answer verified!", "success");
        // Animate the transition
        document.getElementById("step-answer").style.display = "none";
        document.getElementById("step-password").style.display = "block";
        document.getElementById("newPassword").focus(); // Focus on new password input
      } else {
        showMessage("Incorrect answer. Please try again.", "error");
      }
    }
  );
});

// Made this an async function to await hashing
document.getElementById("setNewPassword").addEventListener("click", async function () {
    var newPassword = document.getElementById("newPassword").value;
    if (newPassword) {
      // Hash the password before sending
      const hashedPassword = await hashPassword(newPassword);
      
      chrome.runtime.sendMessage(
        { action: "setNewPassword", passwordHash: hashedPassword },
        function (response) {
          if (chrome.runtime.lastError) {
              console.error(chrome.runtime.lastError.message);
              showMessage("Failed to reset password.", "error");
              return;
          }
          if (response && response.success) {
            showMessage("Password reset successfully!", "success");
            // Optionally disable the button to prevent multiple submissions
            document.getElementById("setNewPassword").disabled = true; 
            setTimeout(() => {
                window.close(); // Close the reset window
            }, 1500);
          } else {
            showMessage("Failed to reset password.", "error");
          }
        }
      );
    } else {
      showMessage("Password cannot be empty!", "error");
    }
});