// --- Supabase Import ---
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// --- Supabase Configuration ---
const supabaseUrl = 'YOUR_SUPABASE_URL';        // <-- PASTE YOUR URL HERE
const supabaseKey = 'YOUR_SUPABASE_ANON_KEY';   // <-- PASTE YOUR ANON KEY HERE
const supabase = createClient(supabaseUrl, supabaseKey);

let currentUserId = null;

let allRecords = []; // Local cache for searching and sorting
let sortState = { column: 'name', direction: 'asc' };
let newFiles = [];
let samplesToDelete = [];

// --- Initial Data (Unchanged) ---
const initialData = [
    { name: "Maureen Wanjiru", id_no: "40124865", phone_no: "0797407603", outlet_name: "Sweet Cup", outlet_location: "Kenol", samples: [] },
    // ... (the rest of your initialData array is unchanged) ...
    { name: "Yvonne Muthoni", id_no: "42861012", phone_no: "0792388022", outlet_name: "Baba Mdogo", outlet_location: "Allsops", samples: [] }
];

// --- Authentication ---
supabase.auth.onAuthStateChange((event, session) => {
    if (session && session.user) {
        currentUserId = session.user.id;
        console.log("Supabase user authenticated:", currentUserId);
        setupRealtimeListener();
    } else {
        currentUserId = null;
        console.log("User is not authenticated.");
    }
});

async function signIn() {
    try {
        // NOTE: Supabase doesn't have a direct equivalent for persistent anonymous sign-in.
        // A common pattern is to create a new user with a random email and let Supabase manage the session.
        const { data, error } = await supabase.auth.signUp({
            email: `user-${Date.now()}@lemonpunch.app`, // Create a temporary, unique email
            password: `password-${Date.now()}`       // Create a temporary, unique password
        });
        if (error && error.message !== "User already registered") throw error;
        // If the user already exists in the browser's local storage, Supabase will automatically sign them in.
    } catch (error) {
        console.error("Authentication failed:", error);
        document.getElementById('loading').textContent = 'Authentication failed. Please refresh.';
    }
}

// --- Supabase Database & Data Handling ---
async function seedInitialData() {
    console.log("Database is empty, seeding initial data...");
    const dataToSeed = initialData.map(record => ({ ...record, user_id: currentUserId }));
    const { error } = await supabase.from('LemonPunch').insert(dataToSeed);
    if (error) {
        console.error("Error seeding data:", error);
    } else {
        console.log("Initial data seeded.");
    }
}

async function fetchRecords() {
    if (!currentUserId) return;
    const { data, error } = await supabase.from('LemonPunch').select('*');

    if (error) {
        console.error("Error fetching records:", error);
        document.getElementById('loading').textContent = 'Error loading data.';
        return;
    }

    allRecords = data;
    document.getElementById('loading').style.display = 'none';
    renderTable();

    if (allRecords.length === 0) {
        seedInitialData();
    }
}

function setupRealtimeListener() {
    const channel = supabase
        .channel('public:LemonPunch')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'LemonPunch' },
            (payload) => {
                console.log('Database change received!', payload);
                // When a change occurs, simply refetch all the data.
                fetchRecords();
            }
        )
        .subscribe();

    // Fetch the initial set of data
    fetchRecords();
}


// --- UI Rendering (This entire section is UNCHANGED) ---
const getMediaIcon = (sample) => { /* ... your original code ... */ };
function renderTable() { /* ... your original code ... */ }

// --- Modals (This entire section is UNCHANGED) ---
const entryModal = document.getElementById('entry-modal');
/* ... all your other modal variables and functions (openModal, closeModal, etc.) ... */

// --- Event Listeners (This entire section is UNCHANGED) ---
document.getElementById('add-new-btn').addEventListener('click', () => openEntryModal());
/* ... all your other event listeners ... */


// --- Form Submission (HEAVILY MODIFIED for Supabase) ---
entryForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUserId) {
        alert("You are not signed in.");
        return;
    }

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
            const existingRecord = allRecords.find(r => r.id == id);
            existingSamples = existingRecord.samples || [];

            // 1. Delete samples from Storage marked for deletion
            if (samplesToDelete.length > 0) {
                const { error: deleteError } = await supabase.storage.from('samples').remove(samplesToDelete);
                if (deleteError) console.warn("Failed to delete some samples:", deleteError);
                existingSamples = existingSamples.filter(sample => !samplesToDelete.includes(sample.path));
            }
        }

        // 2. Upload new files to Storage
        if (newFiles.length > 0) {
            const recordIdForPath = id || supabase.auth.getUser().id + Date.now();
            const uploadPromises = newFiles.map(async file => {
                const filePath = `${currentUserId}/${recordIdForPath}/${Date.now()}-${file.name}`;

                const { error: uploadError } = await supabase.storage
                    .from('samples')
                    .upload(filePath, file);

                if (uploadError) throw uploadError;

                const { data: urlData } = supabase.storage
                    .from('samples')
                    .getPublicUrl(filePath);

                return { url: urlData.publicUrl, path: filePath, type: file.type, name: file.name };
            });
            const newUploadedSamples = await Promise.all(uploadPromises);
            existingSamples.push(...newUploadedSamples);
        }

        recordData.samples = existingSamples;

        if (id) { // UPDATE record in the database
            const { error } = await supabase.from('LemonPunch').update(recordData).eq('id', id);
            if (error) throw error;
        } else { // INSERT new record into the database
            recordData.user_id = currentUserId; // Set the user ID for new records
            const { error } = await supabase.from('LemonPunch').insert(recordData);
            if (error) throw error;
        }

        closeModal(entryModal);
    } catch (error) {
        console.error("Error saving record:", error);
        alert("Could not save record. See console for details.");
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Save Record';
        newFiles = [];
        samplesToDelete = [];
    }
});


// --- Confirm Delete (MODIFIED for Supabase) ---
document.getElementById('confirm-delete-btn').addEventListener('click', async () => {
    if (recordIdToDelete && currentUserId) {
        try {
            // Delete associated files from storage first
            const recordToDelete = allRecords.find(r => r.id == recordIdToDelete);
            if (recordToDelete && recordToDelete.samples && recordToDelete.samples.length > 0) {
                const pathsToDelete = recordToDelete.samples.map(sample => sample.path);
                const { error: deleteError } = await supabase.storage.from('samples').remove(pathsToDelete);
                if (deleteError) console.warn("Failed to delete associated samples:", deleteError);
            }

            // Delete the record from the database
            const { error } = await supabase.from('LemonPunch').delete().eq('id', recordIdToDelete);
            if (error) throw error;

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