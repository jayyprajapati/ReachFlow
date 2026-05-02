import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { useApp } from './AppContext.jsx';
import { makeResumeLabApi, uploadResumeFile, downloadResumePdf } from '../services/resumeLabApi.js';

const ResumeLabContext = createContext(null);

export function useResumeLab() {
  const ctx = useContext(ResumeLabContext);
  if (!ctx) throw new Error('useResumeLab must be used within ResumeLabProvider');
  return ctx;
}

export function ResumeLabProvider({ children }) {
  const { authedFetch, idToken, setNotice } = useApp();
  const api = useMemo(() => makeResumeLabApi(authedFetch), [authedFetch]);

  // ── Resume Vault ─────────────────────────────────────────────────────────
  const [resumes, setResumes] = useState([]);
  const [resumesLoading, setResumesLoading] = useState(false);
  const [uploadState, setUploadState] = useState({ status: 'idle', error: null, result: null });

  const loadResumes = useCallback(async () => {
    setResumesLoading(true);
    try {
      const data = await api.getResumes();
      setResumes(data.resumes || []);
    } catch (err) {
      setNotice({ type: 'error', message: err.message });
    } finally {
      setResumesLoading(false);
    }
  }, [api, setNotice]);

  const uploadResume = useCallback(async (file, meta = {}) => {
    setUploadState({ status: 'uploading', error: null, result: null });
    const formData = new FormData();
    formData.append('resume', file);
    if (meta.title) formData.append('title', meta.title);
    if (meta.type) formData.append('type', meta.type);
    if (meta.tags) formData.append('tags', meta.tags);
    try {
      const result = await uploadResumeFile(idToken, formData);
      setUploadState({ status: 'done', error: null, result });
      setResumes(prev => [result.resume, ...prev]);
      setNotice({ type: 'success', message: `"${result.resume.title || file.name}" parsed and merged into your profile.` });
      return result;
    } catch (err) {
      setUploadState({ status: 'error', error: err.message, result: null });
      setNotice({ type: 'error', message: err.message });
      throw err;
    }
  }, [idToken, setNotice]);

  const resetUploadState = useCallback(() => {
    setUploadState({ status: 'idle', error: null, result: null });
  }, []);

  const updateResume = useCallback(async (id, changes) => {
    try {
      const updated = await api.updateResume(id, changes);
      setResumes(prev => prev.map(r => r.id === id ? updated : r));
      setNotice({ type: 'success', message: 'Resume updated.' });
      return updated;
    } catch (err) {
      setNotice({ type: 'error', message: err.message });
      throw err;
    }
  }, [api, setNotice]);

  const deleteResume = useCallback(async (id) => {
    try {
      await api.deleteResume(id);
      setResumes(prev => prev.filter(r => r.id !== id));
      setNotice({ type: 'success', message: 'Resume deleted.' });
    } catch (err) {
      setNotice({ type: 'error', message: err.message });
      throw err;
    }
  }, [api, setNotice]);

  // ── Canonical Profile ────────────────────────────────────────────────────
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [rebuildLoading, setRebuildLoading] = useState(false);

  const loadProfile = useCallback(async () => {
    setProfileLoading(true);
    try {
      const data = await api.getProfile();
      setProfile(data);
    } catch (err) {
      setNotice({ type: 'error', message: err.message });
    } finally {
      setProfileLoading(false);
    }
  }, [api, setNotice]);

  const rebuildProfile = useCallback(async () => {
    setRebuildLoading(true);
    try {
      const data = await api.rebuildProfile();
      setNotice({ type: 'success', message: `Profile rebuilt from ${data.processedResumes} resumes (v${data.profileVersion}).` });
      await loadProfile();
      return data;
    } catch (err) {
      setNotice({ type: 'error', message: err.message });
      throw err;
    } finally {
      setRebuildLoading(false);
    }
  }, [api, loadProfile, setNotice]);

  // ── JD Analysis ──────────────────────────────────────────────────────────
  const [analyses, setAnalyses] = useState([]);
  const [analysesLoading, setAnalysesLoading] = useState(false);
  const [activeAnalysis, setActiveAnalysis] = useState(null);
  const [analyzeLoading, setAnalyzeLoading] = useState(false);

  const loadAnalyses = useCallback(async () => {
    setAnalysesLoading(true);
    try {
      const data = await api.getAnalyses();
      setAnalyses(data.analyses || []);
    } catch (err) {
      setNotice({ type: 'error', message: err.message });
    } finally {
      setAnalysesLoading(false);
    }
  }, [api, setNotice]);

  const analyzeJD = useCallback(async (payload) => {
    setAnalyzeLoading(true);
    setActiveAnalysis(null);
    try {
      const result = await api.analyzeJD(payload);
      setActiveAnalysis(result);
      setAnalyses(prev => [{
        id: result.analysisId,
        matchScore: result.matchScore,
        jobTitle: payload.jobTitle || '',
        company: payload.company || '',
        seniority: result.seniority || '',
        status: 'analyzed',
        createdAt: new Date().toISOString(),
      }, ...prev]);
      return result;
    } catch (err) {
      setNotice({ type: 'error', message: err.message });
      throw err;
    } finally {
      setAnalyzeLoading(false);
    }
  }, [api, setNotice]);

  const loadAnalysis = useCallback(async (id) => {
    try {
      const data = await api.getAnalysis(id);
      setActiveAnalysis(data);
      return data;
    } catch (err) {
      setNotice({ type: 'error', message: err.message });
    }
  }, [api, setNotice]);

  // ── Resume Generation ────────────────────────────────────────────────────
  const [generatedResumes, setGeneratedResumes] = useState([]);
  const [generatedLoading, setGeneratedLoading] = useState(false);
  const [generateLoading, setGenerateLoading] = useState(false);
  const [selectedGenerated, setSelectedGenerated] = useState(null);
  const [selectedGeneratedLoading, setSelectedGeneratedLoading] = useState(false);

  const loadGenerated = useCallback(async () => {
    setGeneratedLoading(true);
    try {
      const data = await api.getGenerated();
      setGeneratedResumes(data.generatedResumes || []);
    } catch (err) {
      setNotice({ type: 'error', message: err.message });
    } finally {
      setGeneratedLoading(false);
    }
  }, [api, setNotice]);

  const loadGeneratedById = useCallback(async (id) => {
    setSelectedGeneratedLoading(true);
    try {
      const data = await api.getGeneratedById(id);
      setSelectedGenerated(data);
      return data;
    } catch (err) {
      setNotice({ type: 'error', message: err.message });
    } finally {
      setSelectedGeneratedLoading(false);
    }
  }, [api, setNotice]);

  const generateResume = useCallback(async (payload) => {
    setGenerateLoading(true);
    try {
      const result = await api.generateResume(payload);
      setNotice({ type: 'success', message: `Resume generated! Score: ${result.matchScoreBefore}% → ${result.matchScoreAfter}%.` });
      await loadGenerated();
      return result;
    } catch (err) {
      setNotice({ type: 'error', message: err.message });
      throw err;
    } finally {
      setGenerateLoading(false);
    }
  }, [api, loadGenerated, setNotice]);

  const deleteGenerated = useCallback(async (id) => {
    try {
      await api.deleteGenerated(id);
      setGeneratedResumes(prev => prev.filter(g => g.id !== id));
      if (selectedGenerated?.id === id) setSelectedGenerated(null);
      setNotice({ type: 'success', message: 'Generated resume deleted.' });
    } catch (err) {
      setNotice({ type: 'error', message: err.message });
      throw err;
    }
  }, [api, selectedGenerated, setNotice]);

  const downloadPdf = useCallback(async (id, filename = 'resume.pdf') => {
    try {
      const blob = await downloadResumePdf(idToken, id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setNotice({ type: 'error', message: err.message });
      throw err;
    }
  }, [idToken, setNotice]);

  // ── Workspace state ──────────────────────────────────────────────────────
  const [jdText, setJdText] = useState('');
  const [activeGenerated, setActiveGenerated] = useState(null);

  // ── History ──────────────────────────────────────────────────────────────
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const data = await api.getHistory();
      setHistory(data.history || []);
    } catch (err) {
      setNotice({ type: 'error', message: err.message });
    } finally {
      setHistoryLoading(false);
    }
  }, [api, setNotice]);

  const value = useMemo(() => ({
    // Vault
    resumes, resumesLoading, uploadState,
    loadResumes, uploadResume, resetUploadState, updateResume, deleteResume,
    // Profile
    profile, profileLoading, rebuildLoading,
    loadProfile, rebuildProfile,
    // Analysis
    analyses, analysesLoading, activeAnalysis, analyzeLoading,
    loadAnalyses, analyzeJD, loadAnalysis, setActiveAnalysis,
    // Generated
    generatedResumes, generatedLoading, generateLoading,
    selectedGenerated, selectedGeneratedLoading,
    loadGenerated, loadGeneratedById, generateResume, deleteGenerated, downloadPdf,
    setSelectedGenerated,
    // Workspace
    jdText, setJdText, activeGenerated, setActiveGenerated,
    // History
    history, historyLoading, loadHistory,
  }), [
    resumes, resumesLoading, uploadState,
    loadResumes, uploadResume, resetUploadState, updateResume, deleteResume,
    profile, profileLoading, rebuildLoading,
    loadProfile, rebuildProfile,
    analyses, analysesLoading, activeAnalysis, analyzeLoading,
    loadAnalyses, analyzeJD, loadAnalysis,
    generatedResumes, generatedLoading, generateLoading,
    selectedGenerated, selectedGeneratedLoading,
    loadGenerated, loadGeneratedById, generateResume, deleteGenerated, downloadPdf,
    jdText, setJdText, activeGenerated,
    history, historyLoading, loadHistory,
  ]);

  return (
    <ResumeLabContext.Provider value={value}>
      {children}
    </ResumeLabContext.Provider>
  );
}
