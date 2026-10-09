const API_ROOT = 'http://localhost:3000/api';
let accessToken = '';

function showMessage(text, isError = false) {
  const element = document.getElementById('statusMessage');
  element.textContent = text;
  element.className = `alert mt-3 ${isError ? 'alert-danger' : 'alert-success'}`;
}

async function apiRequest(resource, options = {}) {
  const response = await fetch(`${API_ROOT}${resource}`, {
    ...options,
    headers: {
      ...options.headers,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      Array.isArray(error.message)
        ? error.message.join('; ')
        : error.message || `HTTP ${response.status}`,
    );
  }
  return response;
}

async function login(event) {
  event.preventDefault();
  try {
    const response = await apiRequest('/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: document.getElementById('email').value,
        password: document.getElementById('password').value,
      }),
    });
    accessToken = (await response.json()).accessToken;
    document.getElementById('password').value = '';
    showMessage('Signed in. Access tokens are kept only in page memory.');
    await loadDocuments();
  } catch (error) {
    showMessage(error.message, true);
  }
}

async function loadDocuments() {
  const tbody = document.getElementById('documentsList');
  try {
    const docs = await (await apiRequest('/documents?limit=100')).json();
    tbody.replaceChildren();
    document
      .getElementById('emptyState')
      .classList.toggle('d-none', docs.length > 0);
    for (const doc of docs) {
      const row = document.createElement('tr');
      for (const value of [
        doc.fileName,
        doc.mimeType,
        new Date(doc.created_at).toLocaleString(),
      ]) {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.appendChild(cell);
      }
      const actions = document.createElement('td');
      // Never interpolate a source filename into HTML or an inline JavaScript handler.
      for (const [label, action] of [
        ['Download', () => downloadDocument(doc.id, doc.fileName)],
        ['Extract text', () => extractText(doc.id)],
        ['Delete', () => deleteDocument(doc.id)],
      ]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-sm btn-outline-primary me-1';
        button.textContent = label;
        button.addEventListener('click', action);
        actions.appendChild(button);
      }
      row.appendChild(actions);
      tbody.appendChild(row);
    }
  } catch (error) {
    showMessage(error.message, true);
  }
}

async function handleUpload(event) {
  event.preventDefault();
  const fileInput = document.getElementById('fileInput');
  if (!fileInput.files?.length)
    return showMessage('Select a file first.', true);
  const button = document.getElementById('uploadBtn');
  button.disabled = true;
  try {
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    await apiRequest('/documents/upload', { method: 'POST', body: formData });
    fileInput.value = '';
    showMessage('Document uploaded.');
    await loadDocuments();
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    button.disabled = false;
  }
}

async function downloadDocument(id, fileName) {
  try {
    const response = await apiRequest(
      `/documents/${encodeURIComponent(id)}/download`,
    );
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    showMessage(error.message, true);
  }
}

async function extractText(id) {
  try {
    const result = await (
      await apiRequest(`/documents/${encodeURIComponent(id)}/content`)
    ).json();
    document.getElementById('extractedText').textContent =
      result.content || 'No readable text was extracted.';
    showMessage(`Extraction status: ${result.extractionStatus}`);
  } catch (error) {
    showMessage(error.message, true);
  }
}

async function deleteDocument(id) {
  if (!confirm('Delete this document from the active register?')) return;
  try {
    await apiRequest(`/documents/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    showMessage('Document deleted.');
    await loadDocuments();
  } catch (error) {
    showMessage(error.message, true);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('loginForm').addEventListener('submit', login);
  document
    .getElementById('uploadForm')
    .addEventListener('submit', handleUpload);
  document
    .getElementById('refreshBtn')
    .addEventListener('click', loadDocuments);
});
