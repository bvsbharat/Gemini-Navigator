# Gemini Navigator
Public websites like IRS.gov often frustrate users with endless searching for vital information, causing many to give up. GeminiNavigator guides users straight to answers, saving time and effort.

A Chrome extension powered by Google's Gemini Built-in AI to enhance your browsing experience.

## Instruction to use this extension

Once installed, the extension will be active on your browser. You can interact with it by:
1. open the gemini navigator terminal by "Option + G" cmd
2. ask any question like "what is free tax filing limit?"
3. get the answer from gemini navigator on right side with highlight section on the webpage


## Setup Instructions

### to run this chrom extension locally follow below steps

### Chrome Extension Installation - Client

1. Open Google Chrome browser imp: verion should chrome developer verion
2. Navigate to `chrome://extensions/`
3. Enable "Developer mode" by toggling the switch in the top right corner
4. Click on "Load unpacked" button
5. Navigate to the `chrome-extension` directory in this project
6. Select the directory and click "Open"

The extension should now appear in your Chrome toolbar. If you don't see it immediately, click the puzzle piece icon in the toolbar to find and pin the extension.


### Backend Setup

1. Load the data:
```bash
npx tsx ./load_doc.ts data
```

2. Start the server:
```bash
npx tsx server.ts
```

3. Test the server (optional):
```bash
curl -X POST http://localhost:3000/query \
  -H "Content-Type: application/json" \
  -d '{"question": "what is free tax filing limit?"}'



## Development

To make changes to the extension:
1. Update the code in the `chrome-extension` directory
2. Go to `chrome://extensions/`
3. Click the refresh icon on the extension card
4. Your changes will be immediately reflected in the extension