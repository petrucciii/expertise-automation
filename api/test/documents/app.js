const API_URL = 'http://localhost:3000/api/documents';

// Display feedback notification
function showMessage(text, isError = false) {
    const el = document.getElementById('statusMessage');
    el.textContent = text;
    el.className = `alert ${isError ? 'alert-danger' : 'alert-success'}`;
    el.classList.remove('d-none');
    setTimeout(() => {
        el.classList.add('d-none');
    }, 4000);
}

// Fetch and render documents list
async function loadDocuments() {
    const tbody = document.getElementById('documentsList');
    const emptyState = document.getElementById('emptyState');

    try {
        const response = await fetch(API_URL);
        const docs = await response.json();

        tbody.innerHTML = '';

        if (!Array.isArray(docs) || docs.length === 0) {
            emptyState.classList.remove('d-none');
            return;
        }

        emptyState.classList.add('d-none');

        docs.forEach(doc => {
            const tr = document.createElement('tr');

            const isPdf = doc.mimeType.includes('pdf');
            const badgeClass = isPdf ? 'bg-danger' : 'bg-primary';
            const badgeText = isPdf ? 'PDF' : 'DOCX';
            const dateFormatted = new Date(doc.created_at).toLocaleDateString('en-US', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            tr.innerHTML = `
                <td class="align-middle fw-medium">${escapeHtml(doc.fileName)}</td>
                <td class="align-middle"><span class="badge ${badgeClass}">${badgeText}</span></td>
                <td class="align-middle text-muted small">${dateFormatted}</td>
                <td class="align-middle text-end">
                    <button class="btn btn-sm btn-outline-primary me-1" onclick="downloadDocument('${doc.id}', '${escapeHtml(doc.fileName)}')">
                        ⬇️ Download
                    </button>
                    <button class="btn btn-sm btn-outline-info me-1" onclick="extractText('${doc.id}')">
                        📄 Extract Text
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteDocument('${doc.id}')">
                        🗑️ Delete
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.error(err);
        showMessage('Error loading documents list', true);
    }
}

// Handle file upload
async function handleUpload() {
    const fileInput = document.getElementById('fileInput');
    const uploadBtn = document.getElementById('uploadBtn');

    if (!fileInput.files || fileInput.files.length === 0) {
        showMessage('Please select a file first', true);
        return;
    }

    const file = fileInput.files[0];
    const formData = new FormData();
    formData.append('file', file);
    formData.append('ownerId', 1);

    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Uploading...';

    try {
        const response = await fetch(`${API_URL}/upload`, {
            method: 'POST',
            body: formData,
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Upload failed');
        }

        showMessage('Document uploaded successfully!');
        fileInput.value = '';
        await loadDocuments();
    } catch (error) {
        showMessage(error.message, true);
    } finally {
        uploadBtn.disabled = false;
        uploadBtn.textContent = 'Upload Document';
    }
}

// Download document: decode Base64 into Blob
async function downloadDocument(uuid, defaultFileName) {
    try {
        const response = await fetch(`${API_URL}/${uuid}/download`);
        if (!response.ok) throw new Error('Failed to download document');

        const doc = await response.json();

        const byteCharacters = atob(doc.fileContent);
        const byteNumbers = new Uint8Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }

        const blob = new Blob([byteNumbers], { type: doc.mimeType });
        const blobUrl = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = doc.fileName || defaultFileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        URL.revokeObjectURL(blobUrl);
    } catch (error) {
        console.error(error);
        showMessage('Error downloading document', true);
    }
}

// Extract Text content
async function extractText(uuid) {
    try {
        const res = await fetch(`${API_URL}/${uuid}/content`);
        if (!res.ok) throw new Error('Failed to extract text');
        const data = await res.json();
        alert(data.content || 'No text extracted');
    } catch (error) {
        console.error(error);
        showMessage('Error extracting text', true);
    }
}

// Soft delete document
async function deleteDocument(uuid) {
    if (!confirm('Are you sure you want to delete this document?')) return;

    try {
        const response = await fetch(`${API_URL}/${uuid}`, {
            method: 'DELETE',
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.message || 'Error deleting document');
        }

        showMessage('Document deleted successfully');
        await loadDocuments();
    } catch (error) {
        showMessage(error.message, true);
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initial fetch on page load
window.addEventListener('DOMContentLoaded', loadDocuments);
