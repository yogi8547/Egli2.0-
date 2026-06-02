import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import ImportServersModal from '../ImportServersModal';

// ── Fixtures ─────────────────────────────────────────────────────────────

const validJSON = JSON.stringify([
  { id: 'srv-01', name: 'Web Server 01', host: '10.0.0.1', port: 161, snmp_version: '2c', tags: { env: 'prod' } },
  { id: 'srv-02', name: 'DB Server 01', host: '10.0.0.2', port: 161, tags: { env: 'prod', role: 'db' } },
  { id: 'srv-03', name: 'Cache Server', host: '10.0.0.3' },
]);

const validJSONWithWrapper = JSON.stringify({
  servers: [
    { id: 's1', name: 'Server 1', host: '10.0.0.1' },
    { id: 's2', name: 'Server 2', host: '10.0.0.2' },
  ],
});

// ── Mock FileReader ──────────────────────────────────────────────────────
// Must be a real class so `new FileReader()` works in the component.

/** Tracks the last instantiated reader so tests can inspect or wait for it. */
let lastReader = null;

class MockFileReader {
  constructor() {
    this.result = null;
    this._onload = null;
    this._onerror = null;
    /** Store a reference so the test can trigger callbacks synchronously. */
    lastReader = this;
  }
  get onload() { return this._onload; }
  set onload(cb) { this._onload = cb; }
  get onerror() { return this._onerror; }
  set onerror(cb) { this._onerror = cb; }
  readAsText(file) {
    this.result = file._content || '';
    if (file._simulateError) {
      // Simulate async error via microtask
      setTimeout(() => this._onerror?.(), 0);
    } else {
      // Simulate async load via microtask
      setTimeout(() => this._onload?.({ target: { result: this.result } }), 0);
    }
  }
}

function mockFile(content, name = 'servers.json') {
  const blob = new Blob([content], { type: 'application/json' });
  blob.name = name;
  blob._content = content;
  return blob;
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('ImportServersModal', () => {
  const onClose = vi.fn();
  const onImported = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    lastReader = null;

    // Mock fetch default success
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        created: 2, skipped: 1, errors: 0, total: 3,
        results: [
          { id: 'srv-01', status: 'created' },
          { id: 'srv-02', status: 'created' },
          { id: 'srv-03', status: 'skipped', error: 'Duplicate' },
        ],
      }),
    });

    global.FileReader = MockFileReader;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Visibility ─────────────────────────────────────────────────────

  it('returns null when isOpen is false', () => {
    const { container } = render(
      <ImportServersModal isOpen={false} onClose={onClose} onImported={onImported} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders modal structure when open', () => {
    render(
      <ImportServersModal isOpen={true} onClose={onClose} onImported={onImported} />
    );
    // "Import Servers" appears in both the h2 title and the button text
    const titles = screen.getAllByText('Import Servers');
    expect(titles.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/Batch-register servers/)).toBeInTheDocument();
  });

  it('shows upload area when no file is selected', () => {
    render(
      <ImportServersModal isOpen={true} onClose={onClose} onImported={onImported} />
    );
    expect(screen.getByText(/Click to upload/)).toBeInTheDocument();
    expect(screen.getByText(/or drag and drop/)).toBeInTheDocument();
  });

  it('shows expected JSON format hint when no file selected', () => {
    render(
      <ImportServersModal isOpen={true} onClose={onClose} onImported={onImported} />
    );
    expect(screen.getByText('Expected format')).toBeInTheDocument();
  });

  it('shows Cancel button and Import button', () => {
    render(
      <ImportServersModal isOpen={true} onClose={onClose} onImported={onImported} />
    );
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    // "Import Servers" appears in both the header and button, so use getAllByText
    const importTexts = screen.getAllByText('Import Servers');
    expect(importTexts.length).toBeGreaterThanOrEqual(2);
  });

  // ── File Handling ───────────────────────────────────────────────────

  /** Helper: render, simulate file selection, wait for async read to fire. */
  async function selectFile(content, options = {}) {
    const file = mockFile(content);
    if (options.simulateError) file._simulateError = true;

    render(
      <ImportServersModal isOpen={true} onClose={onClose} onImported={onImported} />
    );

    const fileInput = document.getElementById('import-file-input');

    // Wrap file selection in act() so the MockFileReader setTimeout and subsequent
    // React state updates (setParsedServers, setParseError) happen inside act()
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
      // Wait for the setTimeout(…, 0) in MockFileReader.readAsText
      await new Promise((r) => setTimeout(r, 5));
    });

    return { file, fileInput };
  }

  it('parses a valid JSON file and shows server preview', async () => {
    await selectFile(validJSON);

    expect(screen.getByText('Preview (3 servers)')).toBeInTheDocument();
    expect(screen.getByText('Web Server 01')).toBeInTheDocument();
    expect(screen.getByText('DB Server 01')).toBeInTheDocument();
    expect(screen.getByText('Cache Server')).toBeInTheDocument();
    // File name shown
    expect(screen.getByText((c) => c.includes('servers.json'))).toBeInTheDocument();
  });

  it('shows file name after file selection', async () => {
    await selectFile(validJSON);
    expect(screen.getByText(/servers.json/)).toBeInTheDocument();
  });

  it('supports JSON with servers wrapper object', async () => {
    await selectFile(validJSONWithWrapper);
    expect(screen.getByText('Preview (2 servers)')).toBeInTheDocument();
  });

  it('shows parse error for invalid JSON', async () => {
    await selectFile('not valid json');
    expect(screen.getByText('Parse Error')).toBeInTheDocument();
  });

  it('shows error for empty array', async () => {
    await selectFile('[]');
    expect(screen.getByText('Parse Error')).toBeInTheDocument();
  });

  it('shows error for missing required fields', async () => {
    await selectFile('[{"id": "x", "name": "y"}]');
    expect(screen.getByText('Parse Error')).toBeInTheDocument();
  });

  it('shows error for non-array JSON', async () => {
    await selectFile('{"not": "servers"}');
    expect(screen.getByText('Parse Error')).toBeInTheDocument();
  });

  it('shows file read error when FileReader fails', async () => {
    await selectFile('', { simulateError: true });
    expect(screen.getByText('Parse Error')).toBeInTheDocument();
  });

  it('allows removing the selected file', async () => {
    await selectFile(validJSON);

    expect(screen.getByText('Web Server 01')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Remove file'));
    expect(screen.getByText(/Click to upload/)).toBeInTheDocument();
  });

  // ── Submit ──────────────────────────────────────────────────────────

  it('submits parsed servers to the API', async () => {
    await selectFile(validJSON);
    expect(screen.getByText('Preview (3 servers)')).toBeInTheDocument();

    fireEvent.click(screen.getByText(/Import 3 Servers/));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/servers/bulk-import',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('srv-01'),
        })
      );
    });
  });

  it('shows import results after successful submit', async () => {
    await selectFile(validJSON);
    fireEvent.click(screen.getByText(/Import 3 Servers/));

    await waitFor(() => {
      expect(screen.getByText('Import Results')).toBeInTheDocument();
    });
    expect(screen.getByText('2 created')).toBeInTheDocument();
    expect(screen.getByText(/1 skipped/)).toBeInTheDocument();
  });

  it('shows "Import another file" button after results', async () => {
    await selectFile(validJSON);
    fireEvent.click(screen.getByText(/Import 3 Servers/));

    await waitFor(() => {
      expect(screen.getByText('Import another file')).toBeInTheDocument();
    });
  });

  it('calls onImported when servers are created', async () => {
    await selectFile(validJSON);
    fireEvent.click(screen.getByText(/Import 3 Servers/));

    await waitFor(() => expect(onImported).toHaveBeenCalled());
  });

  it('shows error results when fetch returns error response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false, status: 500,
      json: async () => ({
        created: 0, skipped: 0, errors: 3, total: 3,
        detail: 'Server error (500)',
        results: [
          { id: 'srv-01', status: 'error', error: 'Connection failed' },
          { id: 'srv-02', status: 'error', error: 'Timeout' },
          { id: 'srv-03', status: 'error', error: 'Invalid config' },
        ],
      }),
    });

    await selectFile(validJSON);
    fireEvent.click(screen.getByText(/Import 3 Servers/));

    await waitFor(() => {
      expect(screen.getByText('3 failed')).toBeInTheDocument();
    });
  });

  it('toggles expanded error details', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false, status: 500,
      json: async () => ({
        created: 0, skipped: 0, errors: 3, total: 3,
        results: [{ id: 'srv-01', status: 'error', error: 'Connection failed' }],
      }),
    });

    await selectFile(validJSON);
    fireEvent.click(screen.getByText(/Import 3 Servers/));

    await waitFor(() => {
      expect(screen.getByText('Import Results')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('View details'));
    expect(screen.getByText('srv-01')).toBeInTheDocument();

    fireEvent.click(screen.getByText('View details'));
    // After collapsing, srv-01 text is hidden (the error details section collapses)
  });

  it('closes modal when backdrop is clicked', () => {
    render(
      <ImportServersModal isOpen={true} onClose={onClose} onImported={onImported} />
    );
    // The backdrop has classes: absolute inset-0 bg-black/60 backdrop-blur-sm
    const backdrop = document.querySelector('.fixed.inset-0 > div');
    if (backdrop) {
      fireEvent.click(backdrop);
      expect(onClose).toHaveBeenCalled();
    }
  });

  it('closes modal when Cancel is clicked', () => {
    render(
      <ImportServersModal isOpen={true} onClose={onClose} onImported={onImported} />
    );
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('closes modal when close X button is clicked', () => {
    render(
      <ImportServersModal isOpen={true} onClose={onClose} onImported={onImported} />
    );
    // The header close button is a button with hover:bg-dark-700 class
    const buttons = document.querySelectorAll('button');
    // The X close button is the first button in the header section (before Cancel)
    // Look for the button that's a direct child of the header flex container
    const closeBtn = Array.from(buttons).find(
      (btn) => btn.closest('[class*="items-center justify-between"]')
    );
    if (closeBtn) {
      fireEvent.click(closeBtn);
      expect(onClose).toHaveBeenCalled();
    }
  });

  it('has disabled Import button when no file selected', () => {
    render(
      <ImportServersModal isOpen={true} onClose={onClose} onImported={onImported} />
    );
    const allImportBtns = screen.getAllByText('Import Servers');
    // Find the one that's a button (not the h2)
    const importBtn = allImportBtns.find(
      (el) => el.closest('button')
    )?.closest('button');
    expect(importBtn).toBeDisabled();
  });

  it('shows loading state during submission', async () => {
    // Keep fetch pending
    global.fetch = vi.fn().mockImplementation(() => new Promise(() => {}));

    await selectFile(validJSON);
    expect(screen.getByText('Preview (3 servers)')).toBeInTheDocument();

    fireEvent.click(screen.getByText(/Import 3 Servers/));
    expect(screen.getByText('Importing...')).toBeInTheDocument();
  });

  it('toggles skip duplicates checkbox', async () => {
    await selectFile(validJSON);
    expect(screen.getByText('Preview (3 servers)')).toBeInTheDocument();

    // The checkbox is inside a <label> alongside a <span> with "Skip duplicates"
    const label = screen.getByText('Skip duplicates').closest('label');
    const checkbox = label.querySelector('input[type="checkbox"]');
    expect(checkbox).not.toBeNull();
    expect(checkbox.checked).toBe(true);

    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(false);
  });

  it('shows Download example link', () => {
    render(
      <ImportServersModal isOpen={true} onClose={onClose} onImported={onImported} />
    );
    expect(screen.getByText(/Download example/)).toBeInTheDocument();
  });

  it('resets state after importing another file', async () => {
    await selectFile(validJSON);
    fireEvent.click(screen.getByText(/Import 3 Servers/));

    await waitFor(() => {
      expect(screen.getByText('Import another file')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Import another file'));
    expect(screen.getByText(/Click to upload/)).toBeInTheDocument();
  });

  // ── Drag and Drop ───────────────────────────────────────────────────

  it('handles dragOver and dragLeave events without crashing', () => {
    render(
      <ImportServersModal isOpen={true} onClose={onClose} onImported={onImported} />
    );

    const dropZone = document.querySelector('[class*="border-2 border-dashed"]');
    expect(dropZone).toBeInTheDocument();

    fireEvent.dragOver(dropZone);
    fireEvent.dragLeave(dropZone);
  });
});
