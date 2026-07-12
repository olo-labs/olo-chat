/**
 * Copyright (c) 2026 Olo Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import { DocumentsUploadModal } from './DocumentsUploadModal'
import { DocumentUploadRunTracker } from './DocumentUploadRunTracker'
import { DocumentsDeleteDialog } from './documents/DocumentsDeleteDialog'
import { DocumentsUploadTable } from './documents/DocumentsUploadTable'
import { DocumentsUploadToolbar } from './documents/DocumentsUploadToolbar'
import { useDocumentsUpload } from '../hooks/useDocumentsUpload'

export function DocumentsUploadView() {
  const upload = useDocumentsUpload()
  const hasAnyFiles = upload.rows.length > 0
  const emptyForFilter = hasAnyFiles && upload.filteredRows.length === 0

  return (
    <div className="documents-page-root">
      {upload.rows
        .filter((r) => r.runId && r.status === 'processing')
        .map((r) => (
          <DocumentUploadRunTracker key={r.id} row={r} />
        ))}

      <DocumentsUploadToolbar
        mergedSources={upload.mergedSources}
        sourceFilter={upload.sourceFilter}
        searchQuery={upload.searchQuery}
        onSourceFilterChange={upload.setSourceFilter}
        onSearchQueryChange={upload.setSearchQuery}
        onUploadClick={() => upload.setModalOpen(true)}
      />

      {!hasAnyFiles && (
        <div className="documents-page-empty">
          <p className="documents-page-empty-title">No documents uploaded yet</p>
          <button type="button" className="documents-page-btn-primary" onClick={() => upload.setModalOpen(true)}>
            + Upload Files
          </button>
        </div>
      )}

      {emptyForFilter && (
        <div className="documents-page-empty documents-page-empty-soft">
          <p className="documents-page-empty-title">
            No files in {upload.sourceFilter === 'all' ? 'this view' : `"${upload.sourceFilter}"`}
          </p>
          <button type="button" className="documents-page-btn-primary" onClick={() => upload.setModalOpen(true)}>
            Upload Files
          </button>
        </div>
      )}

      {hasAnyFiles && !emptyForFilter && (
        <DocumentsUploadTable
          rows={upload.filteredRows}
          reprocessId={upload.reprocessId}
          onDelete={upload.setDeleteTarget}
          onReprocess={upload.handleReprocess}
        />
      )}

      <p className="documents-page-hint">
        <strong>Upload is handled by the backend</strong> (this UI only sends files over{' '}
        <code>POST /api/resource/upload</code>). Storage is a <strong>server concern</strong>: often a{' '}
        <strong>local shared folder</strong> today; the same API can be backed by{' '}
        <strong>S3, Azure Blob, or similar</strong> as the service is configured. Files are keyed by{' '}
        <strong>capability source</strong>. Indexing/RAG run later when a <strong>capability</strong> uses that
        source—not during upload. Status may follow a <code>runId</code> (e.g. workflow) like Chat events. This table
        is stored locally until a catalog API exists.
      </p>

      <DocumentsUploadModal
        open={upload.modalOpen}
        onClose={() => upload.setModalOpen(false)}
        envOptions={upload.envOptions}
        customSources={upload.customSources}
        onAddCustomSource={upload.addCustomSource}
        defaultSource={upload.defaultModalSource}
        onStartUpload={upload.onStartUpload}
      />

      {upload.deleteTarget && (
        <DocumentsDeleteDialog
          target={upload.deleteTarget}
          onCancel={() => upload.setDeleteTarget(null)}
          onConfirm={() => {
            upload.removeRow(upload.deleteTarget!.id)
            upload.setDeleteTarget(null)
          }}
        />
      )}
    </div>
  )
}
