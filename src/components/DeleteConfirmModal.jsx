import React from "react";

/**
 * Modern, accessible Delete Confirmation Modal.
 * Replaces native browser window.confirm() with a polished design-system dialog.
 */
export default function DeleteConfirmModal({
  isOpen,
  title = "Delete Record",
  itemTitle = "",
  itemDetails = "",
  message = "Are you sure you want to delete this record? This action cannot be undone.",
  confirmLabel = "Delete Record",
  cancelLabel = "Cancel",
  isDeleting = false,
  error = "",
  onConfirm,
  onCancel,
}) {
  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop-custom"
      style={{ zIndex: 1050 }}
      onClick={!isDeleting ? onCancel : undefined}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="modal-card"
        style={{
          maxWidth: "440px",
          width: "90vw",
          padding: "24px",
          borderRadius: "18px",
          boxShadow: "0 25px 60px rgba(15, 23, 42, 0.28)",
          textAlign: "center",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Danger Warning Icon */}
        <div
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "50%",
            background: "#fee2e2",
            color: "#dc2626",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "24px",
            marginBottom: "16px",
          }}
        >
          <i className="bi bi-exclamation-triangle-fill" />
        </div>

        {/* Title & Message */}
        <h4 style={{ fontWeight: 800, color: "#0f172a", marginBottom: "8px", fontSize: "20px" }}>
          {title}
        </h4>

        <p style={{ color: "#64748b", fontSize: "14px", lineHeight: "1.5", marginBottom: "16px" }}>
          {message}
        </p>

        {/* Highlighted item badge / details */}
        {(itemTitle || itemDetails) && (
          <div
            style={{
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: "10px",
              padding: "10px 14px",
              marginBottom: "18px",
              textAlign: "left",
            }}
          >
            {itemTitle && (
              <div style={{ fontWeight: 700, color: "#0f172a", fontSize: "13px" }}>
                {itemTitle}
              </div>
            )}
            {itemDetails && (
              <div style={{ color: "#64748b", fontSize: "11px", marginTop: "2px" }}>
                {itemDetails}
              </div>
            )}
          </div>
        )}

        {/* Error message banner */}
        {error && (
          <div
            className={`alert ${error.includes("INACTIVE") ? "alert-warning" : "alert-danger"} py-2 px-3 text-start small mb-3`}
            style={{ fontSize: "12px", borderRadius: "8px" }}
          >
            <div className="d-flex align-items-start gap-2">
              <i className={`bi ${error.includes("INACTIVE") ? "bi-info-circle-fill text-warning" : "bi-exclamation-octagon-fill text-danger"} flex-shrink-0 mt-1`} />
              <div>
                <div className="fw-bold">{error}</div>
                {(error.includes("referenced") || error.includes("linked") || error.includes("trip")) && !error.includes("INACTIVE") && (
                  <div className="text-muted mt-1" style={{ fontSize: "11px", color: "#7f1d1d" }}>
                    <strong>How to solve:</strong> This record cannot be deleted while other data (such as trips, students, or routes) depend on it. Please reassign or remove the linked records first, or change its status to <strong>INACTIVE / OFFLINE</strong> instead.
                  </div>
                )}
                {error.includes("unique") && (
                  <div className="text-muted mt-1" style={{ fontSize: "11px", color: "#7f1d1d" }}>
                    <strong>How to solve:</strong> A record with this value already exists in the system. Please enter a different, unique identifier.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="d-flex justify-content-center gap-2 mt-2">
          <button
            type="button"
            className="btn btn-light rounded-pill px-4 fw-bold"
            style={{ minWidth: "110px", fontSize: "13px" }}
            onClick={onCancel}
            disabled={isDeleting}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="btn btn-danger rounded-pill px-4 fw-bold d-flex align-items-center justify-content-center gap-2"
            style={{
              minWidth: "140px",
              fontSize: "13px",
              background: "#dc2626",
              borderColor: "#dc2626",
            }}
            onClick={onConfirm}
            disabled={isDeleting}
          >
            <i className="bi bi-trash3-fill" />
            <span>{isDeleting ? "Deleting..." : confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
