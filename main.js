// Firebase Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, onSnapshot, doc, getDocs, addDoc, setDoc, deleteDoc, writeBatch, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// --- Firebase Configuration ---
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : { apiKey: "YOUR_API_KEY", authDomain: "YOUR_AUTH_DOMAIN", projectId: "YOUR_PROJECT_ID" };
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-lemonpunch-db';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

let currentUserId = null;
let recordsCollection;

let allRecords = []; // Local cache for searching and sorting
let sortState = { column: 'name', direction: 'asc' };
let newFiles = [];
let samplesToDelete = [];

// --- Initial Data from PDF ---
const initialData = [
    { name: "Maureen Wanjiru", id_no: "40124865", phone_no: "0797407603", outlet_name: "Sweet Cup", outlet_location: "Kenol", samples: [] },
    { name: "Nanisa Wambui", id_no: "36743447", phone_no: "0719871343", outlet_name: "Sturn", outlet_location: "Kimbo", samples: [] },
    { name: "Rispa Wangui", id_no: "35269710", phone_no: "0702243189", outlet_name: "Kandara", outlet_location: "Makongeni", samples: [] },
    { name: "Pascal Ndinda", id_no: "41385058", phone_no: "0729529301", outlet_name: "Muguga Deport", outlet_location: "Muguga", samples: [] },
    { name: "Leah Gichu", id_no: "41361164", phone_no: "0741672017", outlet_name: "La Quiver", outlet_location: "Kenol", samples: [] },
    { name: "Joan Wanjiku", id_no: "39013054", phone_no: "0791401102", outlet_name: "States", outlet_location: "Landless", samples: [] },
    { name: "Dorcas Kamene", id_no: "41697048", phone_no: "0792064815", outlet_name: "Mcroys", outlet_location: "Makongeni", samples: [] },
    { name: "Erick Mwanza", id_no: "41942601", phone_no: "0795473656", outlet_name: "Lyons", outlet_location: "Ruiru", samples: [] },
    { name: "Scolastica Kemunto", id_no: "40002622", phone_no: "0112445321", outlet_name: "Ng'araria", outlet_location: "Kandara", samples: [] },
    { name: "Mercy Njeri", id_no: "39889371", phone_no: "0110868733", outlet_name: "Mambo Yote", outlet_location: "Pilot", samples: [] },
    { name: "Derrick Kuria", id_no: "39345717", phone_no: "0711954519", outlet_name: "Kay Kay Wines", outlet_location: "Kenol", samples: [] },
    { name: "Gideon Kipkoech", id_no: "39870817", phone_no: "0790906420", outlet_name: "Thika Wines", outlet_location: "Thika Town", samples: [] },
    { name: "Edwin Odhiambo", id_no: "36424136", phone_no: "0745916602", outlet_name: "Muga Wines", outlet_location: "Muguga", samples: [] },
    { name: "Juliet Wangui", id_no: "39033221", phone_no: "0116316347", outlet_name: "Ace Liquor", outlet_location: "Juja", samples: [] },
    { name: "Victor Kiplangat", id_no: "32348675", phone_no: "0708523547", outlet_name: "Makenji Wines & Spirits", outlet_location: "Kabati", samples: [] },
    { name: "Nyang'ara Leah", id_no: "38208097", phone_no: "0711690468", outlet_name: "Terminal 2", outlet_location: "Kabati", samples: [] },
    { name: "Doreen Muriithi", id_no: "39575235", phone_no: "0795905474", outlet_name: "Kay Kay Distributors", outlet_location: "Thika Town", samples: [] },
    { name: "Faith Muia", id_no: "555983455", phone_no: "0719250699", outlet_name: "Cawanga Wines", outlet_location: "Kimbo", samples: [] },
    { name: "Brian Waruingi", id_no: "42401944", phone_no: "0701153686", outlet_name: "Westwoodly", outlet_location: "Juja", samples: [] },
    { name: "Yvonne Muthoni", id_no: "42861012", phone_no: "0792388022", outlet_name: "Baba Mdogo", outlet_location: "Allsops", samples: [] }
];

// --- Authentication ---
onAuthStateChanged(auth, user => {
    if (user) {
        currentUserId = user.uid;
        recordsCollection = collection(db, `artifacts/${appId}/users/${currentUserId}/records`);
        setupRealtimeListener();
    }
});

async function signIn() {
    try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            await signInWithCustomToken(auth, __initial_auth_token);
        } else {
            await signInAnonymously(auth);
        }
    } catch (error) {
        console.error("Authentication failed:", error);
        document.getElementById('loading').textContent = 'Authentication failed. Please refresh.';
    }
}

// --- Firestore & Data Handling ---
async function seedInitialData() {
    const querySnapshot = await getDocs(recordsCollection);
    if (querySnapshot.empty) {
        console.log("Database is empty, seeding initial data...");
        const batch = writeBatch(db);
        initialData.forEach(record => {
            const newDocRef = doc(recordsCollection);
            batch.set(newDocRef, record);
        });
        await batch.commit();
        console.log("Initial data seeded.");
    } else {
        console.log("Database already contains data.");
    }
}

function setupRealtimeListener() {
    if (!recordsCollection) return;
    onSnapshot(recordsCollection, (snapshot) => {
        allRecords = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        document.getElementById('loading').style.display = 'none';
        renderTable();
         if (snapshot.empty) {
            seedInitialData();
        }
    }, (error) => {
        console.error("Error fetching data:", error);
        document.getElementById('loading').textContent = 'Error loading data.';
    });
}

// --- UI Rendering ---
const getMediaIcon = (sample) => {
    const sampleStr = JSON.stringify(sample).replace(/'/g, "&apos;");
    if(sample.type.startsWith('image/')) {
        return `<img src="${sample.url}" class="w-10 h-10 rounded object-cover cursor-pointer view-media-btn" data-sample='${sampleStr}' alt="Sample Image">`;
    } else if(sample.type.startsWith('video/')) {
        return `<div class="w-10 h-10 rounded bg-gray-200 flex items-center justify-center cursor-pointer view-media-btn" data-sample='${sampleStr}'><svg class="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.55a1 1 0 011.45.89v2.22a1 1 0 01-1.45.89L15 12M4 6h11a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V7a1 1 0 011-1z"></path></svg></div>`;
    } else if(sample.type.startsWith('audio/')) {
        return `<div class="w-10 h-10 rounded bg-gray-200 flex items-center justify-center cursor-pointer view-media-btn" data-sample='${sampleStr}'><svg class="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z"></path></svg></div>`;
    }
    return '';
}

function renderTable() {
    const tableBody = document.getElementById('data-table-body');
    const searchInput = document.getElementById('searchInput').value.toLowerCase();
    
    // 1. Filter
    let filteredRecords = allRecords.filter(record => 
        Object.values(record).some(value => {
            if (Array.isArray(value)) return false; // Don't search in samples array
            return String(value).toLowerCase().includes(searchInput)
        })
    );

    // 2. Sort
    filteredRecords.sort((a, b) => {
        const valA = a[sortState.column] || '';
        const valB = b[sortState.column] || '';
        
        if (valA < valB) return sortState.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortState.direction === 'asc' ? 1 : -1;
        return 0;
    });
    
    // 3. Render
    if (filteredRecords.length === 0 && allRecords.length > 0) {
         tableBody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-gray-500">No records found matching your search.</td></tr>`;
    } else if (allRecords.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-gray-500">No records yet. Click 'Add New Record' to start.</td></tr>`;
    } else {
         tableBody.innerHTML = filteredRecords.map(record => `
            <tr class="border-b hover:bg-gray-50">
                <td class="p-4">${record.name}</td>
                <td class="p-4">${record.id_no}</td>
                <td class="p-4">${record.phone_no}</td>
                <td class="p-4">${record.outlet_name}</td>
                <td class="p-4">${record.outlet_location}</td>
                <td class="p-4">
                    <div class="flex items-center gap-1 flex-wrap">
                        ${record.samples && record.samples.length > 0 ? record.samples.map(getMediaIcon).join('') : '<span class="text-xs text-gray-400">N/A</span>'}
                    </div>
                </td>
                <td class="p-4 flex gap-2">
                    <button class="edit-btn text-[#800000] hover:text-[#660000] font-medium" data-id="${record.id}">Edit</button>
                    <button class="delete-btn text-red-600 hover:text-red-800 font-medium" data-id="${record.id}">Delete</button>
                </td>
            </tr>
        `).join('');
    }
}

// --- Modals ---
const entryModal = document.getElementById('entry-modal');
const deleteModal = document.getElementById('delete-modal');
const viewMediaModal = document.getElementById('view-media-modal');
const entryForm = document.getElementById('entry-form');
let recordIdToDelete = null;

function openModal(modal) {
    modal.classList.remove('hidden');
    setTimeout(() => modal.classList.add('opacity-100'), 10);
}

function closeModal(modal) {
    modal.classList.remove('opacity-100');
    setTimeout(() => modal.classList.add('hidden'), 300);
}

function getPreviewElement(sample) {
    const container = document.createElement('div');
    container.className = 'relative group w-24 h-24';

    let previewHTML = '';
     if (sample.type.startsWith('image/')) {
        previewHTML = `<img src="${sample.url}" class="w-full h-full object-cover rounded-md" alt="Existing sample">`;
    } else if (sample.type.startsWith('video/')) {
        previewHTML = `<div class="w-full h-full rounded-md bg-gray-800 flex flex-col items-center justify-center text-white p-1"><svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.55a1 1 0 011.45.89v2.22a1 1 0 01-1.45.89L15 12M4 6h11a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V7a1 1 0 011-1z"></path></svg><span class="text-xs truncate w-full text-center mt-1">${sample.name}</span></div>`;
    } else if (sample.type.startsWith('audio/')) {
        previewHTML = `<div class="w-full h-full rounded-md bg-gray-800 flex flex-col items-center justify-center text-white p-1"><svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z"></path></svg><span class="text-xs truncate w-full text-center mt-1">${sample.name}</span></div>`;
    }

    container.innerHTML = `
        ${previewHTML}
        <button type="button" class="remove-sample-btn absolute top-1 right-1 bg-red-600 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center opacity-75 group-hover:opacity-100" data-path="${sample.path}">&times;</button>
    `;
    container.querySelector('.remove-sample-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        samplesToDelete.push(sample.path);
        container.style.display = 'none';
    });
    return container;
}

function openEntryModal(record = null) {
    entryForm.reset();
    document.getElementById('entry-id').value = '';
    document.getElementById('samples-preview').innerHTML = '';
    document.getElementById('new-samples-preview').innerHTML = '';
    newFiles = [];
    samplesToDelete = [];

    const modalTitle = document.getElementById('modal-title');
    
    if (record) {
        modalTitle.textContent = 'Edit Record';
        document.getElementById('entry-id').value = record.id;
        document.getElementById('name').value = record.name;
        document.getElementById('id_no').value = record.id_no;
        document.getElementById('phone_no').value = record.phone_no;
        document.getElementById('outlet_name').value = record.outlet_name;
        document.getElementById('outlet_location').value = record.outlet_location;

        // Display existing samples
        if (record.samples && record.samples.length > 0) {
            const samplesPreview = document.getElementById('samples-preview');
            record.samples.forEach(sample => {
                samplesPreview.appendChild(getPreviewElement(sample));
            });
        }
    } else {
        modalTitle.textContent = 'Add New Record';
    }
    openModal(entryModal);
}

function openDeleteModal(id) {
    recordIdToDelete = id;
    openModal(deleteModal);
}

function openMediaModal(sample) {
    const contentDiv = document.getElementById('media-content');
    contentDiv.innerHTML = '';

    if (sample.type.startsWith('image/')) {
        const img = document.createElement('img');
        img.src = sample.url;
        img.className = "max-w-full max-h-full rounded-lg";
        contentDiv.appendChild(img);
    } else if (sample.type.startsWith('video/')) {
        const video = document.createElement('video');
        video.src = sample.url;
        video.controls = true;
        video.className = "max-w-full max-h-full rounded-lg";
        contentDiv.appendChild(video);
    } else if (sample.type.startsWith('audio/')) {
        const audio = document.createElement('audio');
        audio.src = sample.url;
        audio.controls = true;
        contentDiv.appendChild(audio);
    }
    
    openModal(viewMediaModal);
}

// --- Event Listeners ---
document.getElementById('add-new-btn').addEventListener('click', () => openEntryModal());
document.getElementById('cancel-btn').addEventListener('click', () => closeModal(entryModal));
document.getElementById('cancel-delete-btn').addEventListener('click', () => closeModal(deleteModal));
document.getElementById('close-media-modal-btn').addEventListener('click', () => closeModal(viewMediaModal));
document.getElementById('searchInput').addEventListener('input', renderTable);

// Sorting listener
document.querySelectorAll('.table-sortable th[data-sort]').forEach(header => {
    header.addEventListener('click', () => {
        const column = header.dataset.sort;
        if (sortState.column === column) {
            sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
        } else {
            sortState.column = column;
            sortState.direction = 'asc';
        }
        renderTable();
    });
});

// Event delegation for table and modals
document.body.addEventListener('click', (e) => {
    const editBtn = e.target.closest('.edit-btn');
    if(editBtn) {
        const recordId = editBtn.dataset.id;
        const record = allRecords.find(r => r.id === recordId);
        openEntryModal(record);
        return;
    }

    const deleteBtn = e.target.closest('.delete-btn');
    if(deleteBtn) {
        const recordId = deleteBtn.dataset.id;
        openDeleteModal(recordId);
        return;
    }

    const viewMediaBtn = e.target.closest('.view-media-btn');
    if(viewMediaBtn) {
        try {
            const sampleData = JSON.parse(viewMediaBtn.dataset.sample.replace(/'/g, '"'));
            openMediaModal(sampleData);
        } catch(err) {
            console.error("Could not parse sample data:", err, viewMediaBtn.dataset.sample);
        }
        return;
    }
});


// Image upload preview listener
document.getElementById('samples-input').addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    newFiles.push(...files);
    const previewContainer = document.getElementById('new-samples-preview');
    files.forEach(file => {
        const sample = { url: URL.createObjectURL(file), type: file.type, name: file.name };
        previewContainer.appendChild(getPreviewElement(sample));
    });
});


// Form submission
entryForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!recordsCollection) return;
    
    const submitButton = e.target.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = 'Saving...';

    const id = document.getElementById('entry-id').value;
    let recordData = {
        name: document.getElementById('name').value,
        id_no: document.getElementById('id_no').value,
        phone_no: document.getElementById('phone_no').value,
        outlet_name: document.getElementById('outlet_name').value,
        outlet_location: document.getElementById('outlet_location').value,
    };

    try {
        let existingSamples = [];

        if (id) { // --- UPDATE LOGIC ---
            const existingRecord = allRecords.find(r => r.id === id);
            existingSamples = existingRecord.samples || [];

            // 1. Delete samples marked for deletion
            if (samplesToDelete.length > 0) {
                const deletePromises = samplesToDelete.map(path => deleteObject(ref(storage, path)).catch(err => console.warn("Failed to delete", path, err)));
                await Promise.all(deletePromises);
                existingSamples = existingSamples.filter(sample => !samplesToDelete.includes(sample.path));
            }
        } else { // --- CREATE LOGIC ---
            recordData.samples = []; 
        }

        // 2. Upload new files
        if (newFiles.length > 0) {
            const recordIdForPath = id || doc(collection(db, '_')).id; 
            const uploadPromises = newFiles.map(file => {
                const filePath = `artifacts/${appId}/users/${currentUserId}/records/${recordIdForPath}/${Date.now()}-${file.name}`;
                const fileRef = ref(storage, filePath);
                return uploadBytes(fileRef, file).then(snapshot => getDownloadURL(snapshot.ref).then(url => ({ url, path: filePath, type: file.type, name: file.name })));
            });
            const newUploadedSamples = await Promise.all(uploadPromises);
            existingSamples.push(...newUploadedSamples);
        }

        recordData.samples = existingSamples;

        if (id) {
            await setDoc(doc(recordsCollection, id), recordData);
        } else {
            await addDoc(recordsCollection, recordData);
        }

        closeModal(entryModal);
    } catch (error) {
        console.error("Error saving record:", error);
        alert("Could not save record. See console for details.");
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Save Record';
    }
});

// Confirm delete
document.getElementById('confirm-delete-btn').addEventListener('click', async () => {
    if (recordIdToDelete && recordsCollection) {
        try {
            // Also delete associated images from storage
            const recordToDelete = allRecords.find(r => r.id === recordIdToDelete);
            if (recordToDelete && recordToDelete.samples && recordToDelete.samples.length > 0) {
                const deletePromises = recordToDelete.samples.map(sample => deleteObject(ref(storage, sample.path)).catch(err => console.warn("Failed to delete", sample.path, err)));
                await Promise.all(deletePromises);
                 console.log("Associated samples deleted from storage.");
            }
            
            await deleteDoc(doc(recordsCollection, recordIdToDelete));
            closeModal(deleteModal);
            recordIdToDelete = null;
        } catch (error) {
            console.error("Error deleting record:", error);
            alert("Could not delete record. See console for details.");
        }
    }
});

// --- App Initialization ---
signIn();