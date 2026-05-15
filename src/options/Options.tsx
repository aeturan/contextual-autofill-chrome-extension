import React, { useState, useEffect, useRef } from 'react';
import Papa from 'papaparse';
import { db } from '../db';
import type { FileMetadata, FileRow } from '../db';

// ============================================================================
// COMPONENT: Alias Input Row (Handles the onBlur Alias -> Column mapping)
// ============================================================================
const AliasInputRow = ({ 
    columnName, 
    initialAlias, 
    fileId, 
    onAliasUpdated 
}: { 
    columnName: string, 
    initialAlias: string, 
    fileId: string, 
    onAliasUpdated: () => void 
}) => {
    const [value, setValue] = useState(initialAlias);

    const handleBlur = async () => {
        const newAlias = value.trim();
        const oldAlias = initialAlias.trim();

        // If nothing changed, do nothing.
        if (newAlias === oldAlias) return;

        // Fetch the active metadata document
        const metadata = await db.file_metadata.get(fileId);
        if (!metadata) return;

        const updatedAliasMap = { ...metadata.alias2column };

        // 1. If there was an old alias, delete it from the map
        if (oldAlias !== "") {
            delete updatedAliasMap[oldAlias];
        }

        // 2. If the new value isn't empty, add the new alias mapping
        if (newAlias !== "") {
            updatedAliasMap[newAlias] = columnName;
        }

        // 3. Save back to Dexie
        await db.file_metadata.update(fileId, { alias2column: updatedAliasMap });
        console.log(`[DB] Updated mapping for ${columnName}: "${oldAlias}" -> "${newAlias}"`);
        
        // 4. Tell parent to re-fetch metadata so the UI stays in sync
        onAliasUpdated();
    };

    return (
        <tr>
            <td style={{ padding: '12px', borderBottom: '1px solid #eee', fontWeight: 500 }}>
                {columnName}
            </td>
            <td style={{ padding: '12px', borderBottom: '1px solid #eee' }}>
                <input
                    type="text"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onBlur={handleBlur}
                    placeholder="e.g. first_name"
                    style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
                />
            </td>
        </tr>
    );
};

// ============================================================================
// MAIN COMPONENT: Options Page
// ============================================================================
export const Options = () => {
    // --- Global State ---
    const [files, setFiles] = useState<FileMetadata[]>([]);
    const [activeFileId, setActiveFileId] = useState<string | null>(null);
    const [activeFileMetadata, setActiveFileMetadata] = useState<FileMetadata | null>(null);

    // --- Modal State ---
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isParsing, setIsParsing] = useState(false);
    const [parsedRows, setParsedRows] = useState<Record<string, string>[]>([]);
    const [columns, setColumns] = useState<string[]>([]);
    const [uploadFilename, setUploadFilename] = useState("");
    
    // Form selections inside Modal
    const [selectedPrimaryKey, setSelectedPrimaryKey] = useState("");
    const [selectedDescriptorKey, setSelectedDescriptorKey] = useState("");
    const [selectedSyncFileId, setSelectedSyncFileId] = useState("");

    // ============================================================================
    // LIFECYCLE & DATA FETCHING
    // ============================================================================
    
    // 1. Load initial data on boot
    useEffect(() => {
        refreshFileList();
        
        // Restore last active file from chrome.storage
        chrome.storage.local.get(["activeFileId"], (result) => {
            if (result.activeFileId) {
                setActiveFileId(result.activeFileId);
            }
        });
    }, []);

    // 2. Whenever activeFileId changes, fetch its metadata and save to chrome storage
    useEffect(() => {
        if (!activeFileId) {
            setActiveFileMetadata(null);
            return;
        }

        chrome.storage.local.set({ activeFileId: activeFileId });
        
        db.file_metadata.get(activeFileId).then(metadata => {
            setActiveFileMetadata(metadata || null);
        });
    }, [activeFileId]);

    const refreshFileList = async () => {
        const allFiles = await db.file_metadata.toArray();
        setFiles(allFiles);
    };

    // ============================================================================
    // MODAL: File Parsing (PapaParse)
    // ============================================================================
    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setIsParsing(true);
        setUploadFilename(file.name);

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                const rawRows = results.data as Record<string, string>[];
                if (rawRows.length > 0) {
                    const colNames = Object.keys(rawRows[0]);
                    setColumns(colNames);
                    setParsedRows(rawRows);
                    
                    // Smart defaults
                    setSelectedPrimaryKey(colNames[0] || "");
                    setSelectedDescriptorKey(colNames[1] || colNames[0] || "");
                }
                setIsParsing(false);
            },
            error: (err) => {
                console.error("PapaParse Error:", err);
                setIsParsing(false);
            }
        });
    };

    // ============================================================================
    // MODAL: Commit to Database
    // ============================================================================
    const handleAddFile = async () => {
        if (!selectedPrimaryKey || !selectedDescriptorKey) {
            alert("Please select both a Profile Key and Descriptor.");
            return;
        }

        const newFileId = `file_${crypto.randomUUID()}`;
        
        // Handle Alias Syncing Logic
        let startingAliases: Record<string, string> = {};
        if (selectedSyncFileId) {
            const syncSource = await db.file_metadata.get(selectedSyncFileId);
            if (syncSource) {
                // Iterate through the older file's aliases.
                // If the new file also has that column name, copy the mapping over.
                for (const [alias, columnName] of Object.entries(syncSource.alias2column)) {
                    if (columns.includes(columnName)) {
                        startingAliases[alias] = columnName;
                    }
                }
            }
        }

        // 1. Build Metadata Object
        const newMetadata: FileMetadata = {
            fileId: newFileId,
            source_name: uploadFilename,
            created_at: new Date().toISOString(),
            type: "local_csv",
            primary_column_name: selectedPrimaryKey,
            descriptor_column_name: selectedDescriptorKey,
            alias2column: startingAliases,
            column_names: columns
        };

        // 2. Build Row Objects
        const newRows: FileRow[] = parsedRows.map(row => ({
            fileId: newFileId,
            primary_key_value: row[selectedPrimaryKey],
            ...row // Splat all columns directly into the object as requested
        }));

        try {
            // Write to database
            await db.file_metadata.add(newMetadata);
            await db.file_rows.bulkAdd(newRows);
            
            console.log(`[DB] Successfully imported ${uploadFilename}`);
            
            // Cleanup UI
            setIsModalOpen(false);
            setParsedRows([]);
            setColumns([]);
            await refreshFileList();
            setActiveFileId(newFileId); // Auto-select the newly uploaded file

        } catch (error) {
            console.error("Database Write Error:", error);
            alert("Failed to save file to database.");
        }
    };

    // ============================================================================
    // HOME SCREEN: Deletion Logic
    // ============================================================================
    const handleDeleteFile = async (targetFileId: string, e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent the dropdown from toggling when clicking the X
        
        if (!confirm("Are you sure you want to delete this file and all its data?")) return;

        try {
            // Delete metadata
            await db.file_metadata.delete(targetFileId);
            // Delete all rows matching this fileId using the index
            await db.file_rows.where('fileId').equals(targetFileId).delete();
            
            console.log(`[DB] Deleted file ${targetFileId}`);
            
            await refreshFileList();
            
            // If we deleted the currently active file, clear the view
            if (activeFileId === targetFileId) {
                setActiveFileId(null);
                setActiveFileMetadata(null);
                chrome.storage.local.remove(["activeFileId"]);
            }
        } catch (error) {
            console.error("Deletion Error:", error);
        }
    };

    // ============================================================================
    // HELPER: The Reverse-Lookup Alias Builder
    // ============================================================================
    // Input: { "first_name": "Name", "company": "Organization" }
    // Output: { "Name": "first_name", "Organization": "company" }
    const getColumnToAliasMap = (metadata: FileMetadata) => {
        const colToAlias: Record<string, string> = {};
        for (const [alias, column] of Object.entries(metadata.alias2column)) {
            colToAlias[column] = alias;
        }
        return colToAlias;
    };

    const sortedFiles = files.toSorted((a, b) => { // sort by date (descending) for dropdowns
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    // ============================================================================
    // RENDER UI
    // ============================================================================
    return (
        <div style={{ maxWidth: '800px', margin: '40px auto', fontFamily: 'system-ui, sans-serif' }}>
            
            {/* --- HEADER --- */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
                <h1 style={{ margin: 0, color: '#333' }}>Contextual Autofill</h1>
                <button 
                    onClick={() => setIsModalOpen(true)}
                    style={{ backgroundColor: '#2196F3', color: 'white', padding: '10px 20px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                    + Import File
                </button>
            </div>

            {/* --- HOME SCREEN: The File Selector Dropdown --- */}
            <div style={{ marginBottom: '30px', backgroundColor: '#fff', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px', color: '#555' }}>
                    Active Data Source
                </label>
                
                {files.length === 0 ? (
                    <div style={{ color: '#888', fontStyle: 'italic' }}>No files uploaded yet.</div>
                ) : (
                    <select 
                        value={activeFileId || ""} 
                        onChange={(e) => setActiveFileId(e.target.value)}
                        style={{ width: '100%', padding: '10px', fontSize: '16px', borderRadius: '4px', border: '1px solid #ccc' }}
                    >
                        <option value="" disabled>Select a file...</option>
                        {sortedFiles.map(f => {
                            const formattedDate = new Date(f.created_at).toLocaleString();
                            return (
                                <option key={f.fileId} value={f.fileId}>
                                    {f.source_name} ({formattedDate})
                                </option>
                            )
                        })}
                    </select>
                )}

                {/* Simulated Custom Dropdown Items for the Delete / Info Buttons */}
                {/* Note: Native <select> tags cannot hold buttons. For a perfect UX matching your spec, 
                    we render the list of files directly below the native selector as a "management list" */}
                {files.length > 0 && (
                    <div style={{ marginTop: '15px', borderTop: '1px solid #eee', paddingTop: '15px' }}>
                        <div style={{ fontSize: '12px', color: '#888', marginBottom: '8px', textTransform: 'uppercase' }}>Manage Databases</div>
                        {files.map(f => (
                            <div key={f.fileId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f5f5f5' }}>
                                <span style={{ fontSize: '14px', color: f.fileId === activeFileId ? '#2196F3' : '#333', fontWeight: f.fileId === activeFileId ? 'bold' : 'normal' }}>
                                    {f.source_name}
                                </span>
                                <div>
                                    <button 
                                        onClick={() => alert(JSON.stringify(f, null, 2))}
                                        style={{ background: 'none', border: '1px solid #ccc', borderRadius: '4px', padding: '4px 8px', marginRight: '8px', cursor: 'pointer', fontSize: '12px' }}
                                    >
                                        (i) Debug
                                    </button>
                                    <button 
                                        onClick={(e) => handleDeleteFile(f.fileId, e)}
                                        style={{ background: '#ff5252', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', fontSize: '12px' }}
                                    >
                                        (x) Delete
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* --- HOME SCREEN: The Alias Mapping Table --- */}
            {activeFileMetadata && (
                <div style={{ backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
                    <div style={{ backgroundColor: '#f8f9fa', padding: '15px 20px', borderBottom: '1px solid #eee' }}>
                        <h3 style={{ margin: 0, color: '#333' }}>Mapping Configuration: {activeFileMetadata.source_name}</h3>
                    </div>
                    
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#fdfdfd' }}>
                                <th style={{ padding: '12px', borderBottom: '2px solid #ddd', color: '#666' }}>File Column</th>
                                <th style={{ padding: '12px', borderBottom: '2px solid #ddd', color: '#666' }}>Autofill Alias</th>
                            </tr>
                        </thead>
                        <tbody>
                            {/* Execute the Reverse-Lookup O(1) rendering logic */}
                            {(() => {
                                const colToAliasMap = getColumnToAliasMap(activeFileMetadata);
                                
                                return activeFileMetadata.column_names.map(colName => (
                                    <AliasInputRow 
                                        key={colName}
                                        columnName={colName}
                                        initialAlias={colToAliasMap[colName] || ""}
                                        fileId={activeFileMetadata.fileId}
                                        onAliasUpdated={() => {
                                            // Re-fetch metadata to trigger a clean re-render
                                            db.file_metadata.get(activeFileMetadata.fileId).then(m => {
                                                if(m) setActiveFileMetadata(m);
                                            });
                                        }}
                                    />
                                ));
                            })()}
                        </tbody>
                    </table>
                </div>
            )}

            {/* ============================================================================ */}
            {/* MODAL OVERLAY: Import File UI */}
            {/* ============================================================================ */}
            {isModalOpen && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 999 }}>
                    <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '8px', width: '500px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
                        
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                            <h2 style={{ margin: 0 }}>Import CSV</h2>
                            <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>✖</button>
                        </div>

                        {/* File Input */}
                        <div style={{ border: '2px dashed #ccc', padding: '20px', textAlign: 'center', borderRadius: '8px', marginBottom: '20px' }}>
                            {isParsing ? (
                                <div style={{ color: '#2196F3', fontWeight: 'bold' }}>⚙️ Parsing document...</div>
                            ) : (
                                <input type="file" accept=".csv" onChange={handleFileSelect} />
                            )}
                        </div>

                        {/* Configuration Dropdowns (Only show if parsing is complete) */}
                        {columns.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '20px' }}>
                                
                                <div>
                                    <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>Choose Profile Key *</label>
                                    <select value={selectedPrimaryKey} onChange={(e) => setSelectedPrimaryKey(e.target.value)} style={{ width: '100%', padding: '8px' }}>
                                        <option value="" disabled>Select column...</option>
                                        {columns.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                    <small style={{ color: '#666' }}>The unique identifier (e.g. Email or ID).</small>
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>Choose Profile Descriptor *</label>
                                    <select value={selectedDescriptorKey} onChange={(e) => setSelectedDescriptorKey(e.target.value)} style={{ width: '100%', padding: '8px' }}>
                                        <option value="" disabled>Select column...</option>
                                        {columns.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                    <small style={{ color: '#666' }}>The human-readable name shown in the UI.</small>
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>Sync Aliases (Optional)</label>
                                    <select value={selectedSyncFileId} onChange={(e) => setSelectedSyncFileId(e.target.value)} style={{ width: '100%', padding: '8px' }}>
                                        <option value="">Do not sync aliases</option>
                                        {sortedFiles.map(f => {
                                            const formattedDate = new Date(f.created_at).toLocaleString();
                                            return (
                                                <option key={f.fileId} value={f.fileId}>
                                                    {f.source_name} ({formattedDate})
                                                </option>
                                            )
                                        })}
                                    </select>
                                    <small style={{ color: '#666' }}>Copy mappings from a previous file with matching column names.</small>
                                </div>

                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button onClick={() => setIsModalOpen(false)} style={{ padding: '10px 20px', border: '1px solid #ccc', background: 'white', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                            <button 
                                onClick={handleAddFile} 
                                disabled={columns.length === 0}
                                style={{ padding: '10px 20px', border: 'none', background: columns.length === 0 ? '#ccc' : '#4CAF50', color: 'white', borderRadius: '4px', cursor: columns.length === 0 ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
                            >
                                Add File
                            </button>
                        </div>

                    </div>
                </div>
            )}

        </div>
    );
};