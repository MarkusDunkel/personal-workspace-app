package at.anlagenbauaustria.aiapp.azureboards.model;

import at.anlagenbauaustria.aiapp.pseudonymize.model.SubmitDecision;

import java.util.List;

/**
 * category wird nur benoetigt, wenn reviewToken null ist (scanForReview
 * fand keine neuen Kandidaten - das Token, das sonst die Kategorie
 * mitfuehren wuerde, wurde in diesem Fall nie vergeben).
 */
public record IngestApplyRequest(String reviewToken, List<SubmitDecision> decisions, String category) {}
