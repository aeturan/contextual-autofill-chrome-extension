# Speed Up Filling Same Forms for Multiple Clients on any Website
... or you can use it for personal purposes, such as quickly filling out booking forms when you're racing to secure a limited number of available seats.

Unlike Autofill services on MacOS or Chrome which support a static template of supported fields like username, address, etc., this extension can be used to record any input field without the limitations.

Note that there is no auto-detection of input fields. Therefore, this tool is useful if you are filling the same form on a website repeatedly for multiple customers.

### Usage
1. `npm run build` will create `dist` folder.
2. Open Chrome. Go to Manage Extensions
3. Activate Developer Mode.
4. Click "Load Unpacked" and load `dist`.
5. Enable the extension.

You can either start recording input fields with static values ...
or if you really want to benefit from the automation capabilities then click on three dots next to extension and go to "Options". Load a csv file with your customer data and create aliases for any column you want. Next time you do *Alt+Click* to record a field, just click on record symbol and choose the alias to automatically fetch the data of a specific customer.

We support some pre-processing options like splitting strings and adjusting german characters. 
Furthermore, there is a built-in conflict resolution (Last Write Wins) option for rows with same ID if you choose to provide a column with timestamp data.

### Key Combinations
-> Click on an input field...
* *Alt+Click*: Starts recording
* *Shift+Click*: Autofill
* *Shift+Alt+Click*: Delete tracking

### Technical Notes
* Used IndexedDB (via Dexie) for storing imported files into 3 different collections: *FileRow*, *FileMetadata* and *Form*. First two are for storing data on the uploaded file and the last one is to track recordings on each website.
* Used Local Storage for keeping track of current settings like active customer, active uploaded file and enabled pre-processing options.

-> You can inspect these databases by checking right-click > Inspect > Application Tab. Check the Local storage under "Extension storage" and note that IndexedDB will only be visible if you do right-click > Inspect on the settings page since it lives in a separate Chrome process and therefore your data is sandboxed away from webpage code.
