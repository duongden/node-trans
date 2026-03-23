import { Router } from "express";
import { listAllDevices } from "../audio/devices.js";
import { loadSettings, saveSettings } from "../storage/settings.js";
import { getSessions, getSession, getUtterances, getSpeakerAliases, setSpeakerAlias, renameSession, deleteSession } from "../storage/history.js";
import { exportSessionToMarkdown } from "../storage/export.js";

const router = Router();

// Devices
router.get("/devices", async (req, res) => {
  try {
    const devices = await listAllDevices();
    res.json(devices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Settings
router.get("/settings", (req, res) => {
  res.json(loadSettings());
});

router.put("/settings", (req, res) => {
  const updated = saveSettings(req.body);
  res.json(updated);
});

// Sessions
router.get("/sessions", (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const offset = parseInt(req.query.offset) || 0;
  res.json(getSessions(limit, offset));
});

router.get("/sessions/:id", (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found" });

  const utterances = getUtterances(req.params.id);
  const speakerAliases = getSpeakerAliases(req.params.id);
  const aliasMap = Object.fromEntries(speakerAliases.map((a) => [a.speaker, a.alias]));
  res.json({ ...session, utterances, speakerAliases: aliasMap });
});

router.patch("/sessions/:id", (req, res) => {
  const { title } = req.body;
  if (title == null) return res.status(400).json({ error: "title is required" });
  renameSession(req.params.id, title);
  res.json({ ok: true });
});

router.put("/sessions/:id/speakers/:speaker", (req, res) => {
  const { alias } = req.body;
  if (!alias) return res.status(400).json({ error: "alias is required" });
  setSpeakerAlias(req.params.id, req.params.speaker, alias);
  res.json({ ok: true });
});

router.delete("/sessions/:id", (req, res) => {
  deleteSession(req.params.id);
  res.json({ ok: true });
});

// Export
router.get("/sessions/:id/export", (req, res) => {
  const result = exportSessionToMarkdown(req.params.id);
  if (!result) return res.status(404).json({ error: "Session not found" });

  res.setHeader("Content-Type", "text/markdown; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="session-${req.params.id}.md"`);
  res.send(result.markdown);
});

export default router;
