document.addEventListener('DOMContentLoaded', function() {
    const aiToggle = document.getElementById('aiToggle');
    
    // Load saved state
    chrome.storage.sync.get(['aiEnabled'], function(result) {
        aiToggle.checked = result.aiEnabled !== false; // Default to true if not set
    });

    // Save state on change
    aiToggle.addEventListener('change', function() {
        chrome.storage.sync.set({
            aiEnabled: aiToggle.checked
        });
    });
});
