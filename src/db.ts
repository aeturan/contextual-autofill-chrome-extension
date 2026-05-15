import Dexie, { type Table } from "dexie";

// 1. Define the TypeScript Interface for our Data Model
export interface FileRow {
    fileId: string; // A UUID grouping rows to a specific imported file
    primary_key_value: string; // if multi-col then concatenation of them
    [column: string]: string; // includes primary key column as well
}

export interface FileMetadata {
    fileId: string;
    source_name: string;
    created_at: string;        // ISO datetime string
    type: "local_csv";          // extend union later: | "google_sheet" | "rest_api"
    primary_column_name: string;
    descriptor_column_name: string;
    alias2column: Record<string, string>;  // { alias: column, ... }
    column_names: string[];  // including the primary_column_name
}

export interface Form {
    origin: string;             // e.g. "https://example.com" — primary key
    created_at: string;
    fields: Record<string, {  // selector -> alias mapping
        field_type: string; // dropdown, checkbox, text, ...
        autofill_value: string;
        is_hardcoded: boolean; // hardcoded or a pointer to collect from file
    }>;
}


// 2. Initialize the Database
const db = new Dexie("ContextualAutofillDB") as Dexie & {
    file_rows:     Table<FileRow,      [string, string]>; // primary key: [fileId, primary_key_value]
    file_metadata: Table<FileMetadata, string>; // primary key: fileId
    forms:         Table<Form,         string>; // primary key: origin
};

// 3. Define the Indexes (The Schema)
// We DO NOT list every column here. We only list the keys we need to filter/search by.
db.version(1).stores({
    file_rows:      '[fileId+primary_key_value], fileId',
    file_metadata:  'fileId',
    forms:          'origin'
})

export { db };