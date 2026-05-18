import React, { useState, useEffect } from 'react';
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

    useEffect(() => {
        setValue(initialAlias);
    }, [initialAlias]);

    const handleBlur = async () => {
        const newAlias = value.trim();
        const oldAlias = initialAlias.trim();

        if (newAlias === oldAlias) return;

        const metadata = await db.file_metadata.get(fileId);
        if (!metadata) return;

        const updatedAliasMap = { ...metadata.alias2column };

        if (oldAlias !== "") {
            delete updatedAliasMap[oldAlias];
        }

        if (newAlias !== "") {
            updatedAliasMap[newAlias] = columnName;
        }

        await db.file_metadata.update(fileId, { alias2column: updatedAliasMap });
        console.log(`[DB] Updated mapping for ${columnName}: "${oldAlias}" -> "${newAlias}"`);
        
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
    
    // --- Lean Profile State ---
    const [activeProfileKey, setActiveProfileKey] = useState<string | null>(null);
    const [profileOptions, setProfileOptions] = useState<{key: string, label: string}[]>([]);

    // --- Modal State ---
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isParsing, setIsParsing] = useState(false);
    const [parsedRows, setParsedRows] = useState<Record<string, string>[]>([]);
    const [columns, setColumns] = useState<string[]>([]);
    const [uploadFilename, setUploadFilename] = useState("");
    
    // --- Modal Selections ---
    const [selectedPrimaryKey, setSelectedPrimaryKey] = useState("");
    const [selectedDescriptorKey, setSelectedDescriptorKey] = useState("");
    const [selectedSyncFileId, setSelectedSyncFileId] = useState("");

    // --- Formatting State ---
    const [convertTurkishChars, setConvertTurkishChars] = useState(false);

    // --- Conflict Resolution State ---
    const [isConflictModalOpen, setIsConflictModalOpen] = useState(false);
    const [selectedTimestampKey, setSelectedTimestampKey] = useState("");

    // --- Split Configuration State ---
    const [splits, setSplits] = useState<{column: string, delimiter: string}[]>([]);
    const [selectedSyncSplitsFileId, setSelectedSyncSplitsFileId] = useState("");

    // ============================================================================
    // LIFECYCLE & DATA FETCHING
    // ============================================================================
    
    useEffect(() => {
        refreshFileList();
        
        // 1. Ask Chrome's hard drive for our saved values
        chrome.storage.local.get(["activeFileId", "convertTurkishChars"], (result) => {
            
            if (result.activeFileId) {
                setActiveFileId(result.activeFileId);
            }
            
            // 2. If Chrome has a saved preference for the checkbox, push it into React's memory
            if (result.convertTurkishChars !== undefined) {
                setConvertTurkishChars(result.convertTurkishChars);
            }
        });
    }, []);

    useEffect(() => {
        if (!activeFileId) {
            setActiveFileMetadata(null);
            setProfileOptions([]);
            setActiveProfileKey(null);
            chrome.storage.local.remove(["activeProfileKey"]);
            return;
        }

        chrome.storage.local.set({ activeFileId: activeFileId });
        
        Promise.all([
            db.file_metadata.get(activeFileId),
            db.file_rows.where('fileId').equals(activeFileId).toArray()
        ]).then(([metadata, rows]) => {
            setActiveFileMetadata(metadata || null);

            if (metadata && rows.length > 0) {
                // Lean Memory mapping for the UI
                const minimalOptions = rows.map(row => ({
                    key: row.primary_key_value,
                    label: row[metadata.descriptor_column_name]
                }));

                // Sort the array alphabetically by the label property
                minimalOptions.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
                
                setProfileOptions(minimalOptions);

                // Ask local storage first for the default value of profile
                chrome.storage.local.get(["activeProfileKey"], (result) => {
                    const storedKey = result.activeProfileKey;
                    
                    // Check if the stored key actually belongs to the current file's rows
                    const isValidStoredKey = minimalOptions.some(opt => opt.key === storedKey);

                    if (isValidStoredKey) {
                        // 1. Source of Truth: Obey local storage
                        setActiveProfileKey(storedKey);
                    } else {
                        // 2. Data Source Changed OR Storage is Empty: Dictate the first row
                        const firstKey = minimalOptions[0].key;
                        setActiveProfileKey(firstKey);
                        chrome.storage.local.set({ activeProfileKey: firstKey });
                    }
                });
            } else {
                setProfileOptions([]);
                setActiveProfileKey(null);
                chrome.storage.local.remove(["activeProfileKey"]);
            }
        });
    }, [activeFileId]);

    const refreshFileList = async () => {
        const allFiles = await db.file_metadata.toArray();
        setFiles(allFiles);
    };

    // ============================================================================
    // MODAL: File Parsing
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
    // MODAL: Check for Duplicates & Commit to Database
    // ============================================================================
    
    const commitToDatabase = async (rowsToSave: Record<string, string>[]) => {
        const newFileId = `file_${crypto.randomUUID()}`;
        
        // --- 1. PROCESS SPLITS IN MEMORY ---
        let finalColumns = [...columns];
        let processedRows = rowsToSave.map(row => ({ ...row })); // Clone rows to avoid mutating original state

        splits.forEach(split => {
            if (!split.column || !split.delimiter) return; // Skip empty configurations

            let maxChunks = 0;
            
            // Apply splits to every row
            processedRows.forEach(row => {
                // 1. Trim the entire string FIRST to kill leading/trailing spaces
                const val = (row[split.column] || "").trim(); 
                
                // 2. Split, then filter out empty strings (kills double-spaces)
                const chunks = val.split(split.delimiter).filter(chunk => chunk !== "");
                
                if (chunks.length > maxChunks) maxChunks = chunks.length;
                
                // Add the new columns to this row (e.g., "Full Name (1)", "Full Name (2)")
                chunks.forEach((chunk, index) => {
                    const newColName = `${split.column} (${index + 1})`;
                    row[newColName] = chunk.trim(); // Extra safety trim
                });
            });

            // Register the newly discovered column names globally
            for (let i = 1; i <= maxChunks; i++) {
                const newColName = `${split.column} (${i})`;
                if (!finalColumns.includes(newColName)) {
                    finalColumns.push(newColName);
                }
            }
        });

        // --- 2. BUILD DATABASE OBJECTS ---
        let startingAliases: Record<string, string> = {};
        if (selectedSyncFileId) {
            const syncSource = await db.file_metadata.get(selectedSyncFileId);
            if (syncSource) {
                for (const [alias, columnName] of Object.entries(syncSource.alias2column)) {
                    // Use finalColumns so we can sync previously split columns too!
                    if (finalColumns.includes(columnName)) { 
                        startingAliases[alias] = columnName;
                    }
                }
            }
        }

        const newMetadata: FileMetadata = {
            fileId: newFileId,
            source_name: uploadFilename,
            created_at: new Date().toISOString(),
            type: "local_csv",
            primary_column_name: selectedPrimaryKey,
            descriptor_column_name: selectedDescriptorKey,
            alias2column: startingAliases,
            column_names: finalColumns, // Use the expanded column list
            column_splits: splits
        };

        const newRows: FileRow[] = processedRows.map(row => ({
            fileId: newFileId,
            primary_key_value: row[selectedPrimaryKey],
            ...row 
        }));

        // --- 3. SAVE ---
        try {
            await db.file_metadata.add(newMetadata);
            await db.file_rows.bulkAdd(newRows);
            
            console.log(`[DB] Successfully imported ${uploadFilename}`);
            
            setIsModalOpen(false);
            setIsConflictModalOpen(false); 
            setParsedRows([]);
            setColumns([]);
            setSplits([]); // Reset splits for next upload
            await refreshFileList();
            setActiveFileId(newFileId); 

        } catch (error) {
            console.error("Database Write Error:", error);
            alert("Failed to save file to database.");
        }
    };
    
    // The handler when user clicks "Add File"
    const handleAddFile = () => {
        if (!selectedPrimaryKey || !selectedDescriptorKey) {
            alert("Please select both a Profile Key and Descriptor.");
            return;
        }

        // 1. Check for duplicates using a Set
        const uniqueKeys = new Set();
        let hasDuplicates = false;

        for (const row of parsedRows) {
            const pk = row[selectedPrimaryKey];
            if (uniqueKeys.has(pk)) {
                hasDuplicates = true;
                break;
            }
            uniqueKeys.add(pk);
        }

        // 2. Traffic Control
        if (hasDuplicates) {
            // Open the conflict resolution popup
            setSelectedTimestampKey(columns[0] || ""); // Default to first column
            setIsConflictModalOpen(true);
        } else {
            // Safe to save immediately
            commitToDatabase(parsedRows);
        }
    };

    // The handler when user clicks "Solve Conflict"
    const handleSolveConflict = () => {
        if (!selectedTimestampKey) {
            alert("Please select a timestamp column.");
            return;
        }

        const deduplicatedMap = new Map<string, Record<string, string>>();

        for (const row of parsedRows) {
            const pk = row[selectedPrimaryKey];
            
            if (deduplicatedMap.has(pk)) {
                // We found a duplicate, compare timestamps
                const existingRow = deduplicatedMap.get(pk)!;
                
                // Parse dates safely. If invalid, defaults to NaN.
                const existingTime = new Date(existingRow[selectedTimestampKey]).getTime();
                const newTime = new Date(row[selectedTimestampKey]).getTime();

                // Keep the new row if its time is strictly greater, or if the existing time is invalid
                if (!isNaN(newTime) && (isNaN(existingTime) || newTime > existingTime)) {
                    deduplicatedMap.set(pk, row);
                }
            } else {
                // First time seeing this key, save it to the Map
                deduplicatedMap.set(pk, row);
            }
        }

        // Convert the Map values back to an array and save
        const resolvedRows = Array.from(deduplicatedMap.values());
        commitToDatabase(resolvedRows);
    };


    // ============================================================================
    // HOME SCREEN: Deletion Logic
    // ============================================================================
    const handleDeleteFile = async (targetFileId: string, e: React.MouseEvent) => {
        e.stopPropagation(); 
        
        if (!confirm("Are you sure you want to delete this file and all its data?")) return;

        try {
            await db.file_metadata.delete(targetFileId);
            await db.file_rows.where('fileId').equals(targetFileId).delete();
            
            console.log(`[DB] Deleted file ${targetFileId}`);
            await refreshFileList();
            
            if (activeFileId === targetFileId) {
                setActiveFileId(null);
                setActiveFileMetadata(null);
                chrome.storage.local.remove(["activeFileId"]);
            }
        } catch (error) {
            console.error("Deletion Error:", error);
        }
    };

    const getColumnToAliasMap = (metadata: FileMetadata) => {
        const colToAlias: Record<string, string> = {};
        for (const [alias, column] of Object.entries(metadata.alias2column)) {
            colToAlias[column] = alias;
        }
        return colToAlias;
    };

    // ============================================================================
    // RENDER PREPARATION
    // ============================================================================
    
    // Sort files by newest first (avoiding strict-mode TS date arithmetic errors)
    const sortedFiles = [...files].sort((a, b) => {
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
                <div>Shift+Click (Autofill) -- Alt+Click(Record) -- Alt+Shift+Click(Delete)</div>
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
                
                {sortedFiles.length === 0 ? (
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
                            );
                        })}
                    </select>
                )}

                {sortedFiles.length > 0 && (
                    <div style={{ marginTop: '15px', borderTop: '1px solid #eee', paddingTop: '15px' }}>
                        <div style={{ fontSize: '12px', color: '#888', marginBottom: '8px', textTransform: 'uppercase' }}>Manage Databases</div>
                        {sortedFiles.map(f => {
                            const formattedDate = new Date(f.created_at).toLocaleString();
                            return (
                                <div key={f.fileId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f5f5f5' }}>
                                    <span style={{ fontSize: '14px', color: f.fileId === activeFileId ? '#2196F3' : '#333', fontWeight: f.fileId === activeFileId ? 'bold' : 'normal' }}>
                                        {f.source_name} <span style={{color: '#999', fontSize: '12px'}}>({formattedDate})</span>
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
                            );
                        })}
                    </div>
                )}
            </div>

            {/* --- HOME SCREEN: The Active Profile Selector --- */}
            {activeFileMetadata && profileOptions.length > 0 && (
                <div style={{ marginBottom: '30px', backgroundColor: '#fff', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                    <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px', color: '#555' }}>
                        Active Profile
                    </label>
                    <select 
                        value={activeProfileKey || ""} 
                        onChange={(e) => {
                            const newKey = e.target.value;
                            setActiveProfileKey(newKey);
                            chrome.storage.local.set({ activeProfileKey: newKey });
                        }}
                        style={{ width: '100%', padding: '10px', fontSize: '16px', borderRadius: '4px', border: '1px solid #ccc' }}
                    >
                        {profileOptions.map(option => (
                            <option key={option.key} value={option.key}>
                                {option.label} ({option.key})
                            </option>
                        ))}
                    </select>
                </div>
            )}

            {/* --- Data Formatting Options --- */}
            {activeFileMetadata && (
                <div style={{ marginBottom: '30px', backgroundColor: '#fff', padding: '15px 20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <input 
                        type="checkbox" 
                        id="turkish-toggle"
                        // React reads from state to know if it should draw the checkmark
                        checked={convertTurkishChars} 
                        
                        onChange={(e) => {
                            const isChecked = e.target.checked;
                            setConvertTurkishChars(isChecked);                            
                            // Save to Chrome's hard drive (Persists after closing)
                            chrome.storage.local.set({ convertTurkishChars: isChecked });
                        }}
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                    <label htmlFor="turkish-toggle" style={{ cursor: 'pointer', color: '#444', fontWeight: '500', userSelect: 'none' }}>
                        Convert Turkish characters to German (ç ➔ c, ğ ➔ g, etc.)
                    </label>
                </div>
            )}

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
                            {(() => {
                                const colToAliasMap = getColumnToAliasMap(activeFileMetadata);
                                
                                return activeFileMetadata.column_names.map(colName => (
                                    <AliasInputRow 
                                        key={`${activeFileMetadata.fileId}-${colName}`}
                                        columnName={colName}
                                        initialAlias={colToAliasMap[colName] || ""}
                                        fileId={activeFileMetadata.fileId}
                                        onAliasUpdated={() => {
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
                    <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '8px', width: '500px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
                        
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                            <h2 style={{ margin: 0 }}>Import CSV</h2>
                            <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>✖</button>
                        </div>

                        <div style={{ border: '2px dashed #ccc', padding: '20px', textAlign: 'center', borderRadius: '8px', marginBottom: '20px' }}>
                            {isParsing ? (
                                <div style={{ color: '#2196F3', fontWeight: 'bold' }}>⚙️ Parsing document...</div>
                            ) : (
                                <input type="file" accept=".csv" onChange={handleFileSelect} />
                            )}
                        </div>

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
                                            );
                                        })}
                                    </select>
                                    <small style={{ color: '#666' }}>Copy mappings from a previous file with matching column names.</small>
                                </div>

                                {/* --- SYNC SPLITS UI --- */}
                                <div style={{ marginTop: '10px', paddingTop: '15px', borderTop: '1px solid #eee' }}>
                                    <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>Sync Splits (Optional)</label>
                                    <select 
                                        value={selectedSyncSplitsFileId} 
                                        onChange={async (e) => {
                                            const fileId = e.target.value;
                                            setSelectedSyncSplitsFileId(fileId);
                                            
                                            if (!fileId) return;

                                            const syncSource = await db.file_metadata.get(fileId);
                                            if (syncSource && syncSource.column_splits) {
                                                // Guardrail: Only import splits if the column exists in the current CSV
                                                const applicableSplits = syncSource.column_splits.filter(split => 
                                                    columns.includes(split.column)
                                                );
                                                setSplits(applicableSplits);
                                            } else {
                                                setSplits([]); // Clear if the old file had no splits
                                            }
                                        }} 
                                        style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                                    >
                                        <option value="">Do not sync splits</option>
                                        {sortedFiles.map(f => {
                                            const formattedDate = new Date(f.created_at).toLocaleString();
                                            return (
                                                <option key={f.fileId} value={f.fileId}>
                                                    {f.source_name} ({formattedDate})
                                                </option>
                                            );
                                        })}
                                    </select>
                                    <small style={{ color: '#666' }}>Copy column splitting rules from a previous file.</small>
                                </div>
                                {/* --------------------------- */}

                                {/* --- SPLIT COLUMNS UI --- */}
                                    <div style={{ marginTop: '10px', paddingTop: '15px', borderTop: '1px solid #eee' }}>
                                        <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '10px' }}>Split Columns (Optional)</label>
                                        
                                        {splits.map((split, index) => (
                                            <div key={index} style={{ display: 'flex', gap: '10px', marginBottom: '10px', width: '100%', alignItems: 'center' }}>
                                                <select 
                                                    value={split.column} 
                                                    onChange={(e) => {
                                                        const newSplits = [...splits];
                                                        newSplits[index].column = e.target.value;
                                                        setSplits(newSplits);
                                                    }}
                                                    // NEW: flex: 2 (takes more space), minWidth: 0 (forces it to stay inside modal)
                                                    style={{ flex: '2 1 0', minWidth: 0, padding: '8px', borderRadius: '4px', border: '1px solid #ccc', textOverflow: 'ellipsis' }}
                                                >
                                                    <option value="" disabled>Select column...</option>
                                                    {columns.map(c => <option key={c} value={c}>{c}</option>)}
                                                </select>
                                                
                                                <input 
                                                    type="text" 
                                                    placeholder="Delimiter (e.g. ',', '-' or ' ')" 
                                                    value={split.delimiter}
                                                    onChange={(e) => {
                                                        const newSplits = [...splits];
                                                        newSplits[index].delimiter = e.target.value;
                                                        setSplits(newSplits);
                                                    }}
                                                    // NEW: flex: 1 (takes less space), minWidth: 0
                                                    style={{ flex: '1 1 0', minWidth: 0, padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                                                />
                                                
                                                <button 
                                                    onClick={() => {
                                                        // This safely purges the row from React state. No zombies!
                                                        const newSplits = splits.filter((_, i) => i !== index);
                                                        setSplits(newSplits);
                                                    }}
                                                    title="Delete Split"
                                                    // NEW: flex: '0 0 auto' (prevents button from stretching or shrinking)
                                                    style={{ flex: '0 0 auto', padding: '8px 12px', border: 'none', background: '#ff5252', color: 'white', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                                                >
                                                    ✖
                                                </button>
                                            </div>
                                        ))}
                                        
                                        <button 
                                            onClick={() => setSplits([...splits, { column: "", delimiter: "" }])}
                                            style={{ padding: '8px 15px', border: '1px dashed #2196F3', color: '#2196F3', background: 'transparent', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', width: '100%' }}
                                        >
                                            + Add Split
                                        </button>
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

            {/* ============================================================================ */}
            {/* MODAL OVERLAY: Conflict Resolution UI */}
            {/* ============================================================================ */}
            {isConflictModalOpen && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
                    <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '8px', width: '450px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
                        
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                            <h2 style={{ margin: 0, color: '#ff4444' }}>Duplicates Detected</h2>
                            <button onClick={() => setIsConflictModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#666' }}>✖</button>
                        </div>

                        <p style={{ color: '#555', marginBottom: '20px', lineHeight: '1.5' }}>
                            We found multiple rows with the same Profile Key. 
                        </p>

                        <div style={{ backgroundColor: '#fff3cd', border: '1px solid #ffeeba', padding: '15px', borderRadius: '6px', marginBottom: '25px' }}>
                            <h4 style={{ margin: '0 0 10px 0', color: '#856404' }}>Conflict Resolution: Take the latest row only</h4>
                            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px', color: '#856404' }}>Choose Timestamp Column</label>
                            <select 
                                value={selectedTimestampKey} 
                                onChange={(e) => setSelectedTimestampKey(e.target.value)} 
                                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                            >
                                <option value="" disabled>Select column...</option>
                                {columns.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button onClick={() => setIsConflictModalOpen(false)} style={{ padding: '10px 20px', border: '1px solid #ccc', background: 'white', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                            <button 
                                onClick={handleSolveConflict} 
                                style={{ padding: '10px 20px', border: 'none', background: '#ff4444', color: 'white', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                            >
                                Solve Conflict & Import
                            </button>
                        </div>

                    </div>
                </div>
            )}

        </div>
    );
};