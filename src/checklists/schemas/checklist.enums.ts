// KMA = Kvalitet, Miljö, Arbetsmiljö. Egenkontroll = self-inspection checklist.
export enum ChecklistCategory {
  Quality = "quality", // Kvalitet
  Environment = "environment", // Miljö
  WorkEnvironment = "work_environment", // Arbetsmiljö
  Other = "other",
}

export enum ChecklistStatus {
  Draft = "draft", // pågående
  Completed = "completed", // klar (all points answered)
  Signed = "signed", // signerad
}

// Per-item outcome on a running egenkontroll.
export enum ChecklistItemResult {
  Pending = "pending", // ej besvarad
  Ok = "ok", // godkänd
  Remark = "remark", // anmärkning
  NotApplicable = "na", // ej aktuellt
}
