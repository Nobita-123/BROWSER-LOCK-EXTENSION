document.addEventListener("DOMContentLoaded", loadQuestion);

function showMessage(text, type = "error") {
  const messageEl = document.getElementById("message-box");
  messageEl.textContent = text;
  messageEl.classList.remove('error', 'success'); 
  messageEl.classList.add(type, 'show');
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
      questionDisplay.textContent = "No security question found.";
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
        document.getElementById("step-answer").style.display = "none";
        document.getElementById("step-password").style.display = "block";
        document.getElementById("newPassword").focus();
      } else {
        showMessage("Incorrect answer. Please try again.", "error");
      }
    }
  );
});

document.getElementById("setNewPassword").addEventListener("click", function () {
    var newPassword = document.getElementById("newPassword").value;
    if (newPassword) {
      // Send plain-text password to background to be hashed
      chrome.runtime.sendMessage(
        { action: "setNewPassword", password: newPassword },
        function (response) {
          if (chrome.runtime.lastError || !response.success) {
              showMessage("Failed to reset password.", "error");
              return;
          }
          
          showMessage("Password reset successfully! Unlocking...", "success");
          document.getElementById("setNewPassword").disabled = true; 
          
          // UX Improvement: Tell background to unlock the browser
          setTimeout(() => {
              chrome.runtime.sendMessage({ action: 'unlockAfterReset' }, (res) => {
                  if (res && res.success) {
                    // NEW: Redirect to new tab page after reset
                    window.location.replace(res.redirectUrl);
                  } else if (chrome.runtime.lastError) {
                    console.error(chrome.runtime.lastError.message);
                  }
              });
          }, 1500);
        }
      );
    } else {
      showMessage("Password cannot be empty!", "error");
    }
});