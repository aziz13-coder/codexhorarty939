import React, { useState, useEffect, useMemo, useRef } from 'react';
// Resolve assets via import.meta.url so Vite bundles them with correct paths
const appLogoIco = new URL('../assets/voxstella-logo-256.ico', import.meta.url).href;
const appLogoPng = new URL('../assets/voxstella-logo.png', import.meta.url).href;
const chartsPng = new URL('../assets/voxstella-charts.png', import.meta.url).href;
import { buildChartPayload } from './utils/buildChartPayload';
import { parseReasoningEntry } from './utils/parseReasoning.mjs';
import { cleanMoonText } from './utils/cleanMoonText';
import { renderReasoning } from './utils/renderReasoning.jsx';
import { getUseReasoningV1 } from './utils/useReasoningFlag.mjs';
import ErrorBoundary from './ErrorBoundary.jsx';

import { 
  Calendar, 
  Clock, 
  MapPin, 
  Sun, 
  Moon, 
  Star, 
  Settings as SettingsIcon, 
  Search, 
  FileText, 
  Share2, 
  Download, 
  Palette,
  Brain,
  Copy,
  ExternalLink,
  ChevronRight,
  Plus,
  Eye,
  Zap,
  Target,
  BarChart3,
  Book,
  Users,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  XCircle,
  HelpCircle,
  Filter,
  SortDesc,
  MessageSquare,
  Edit3,
  Save,
  Play,
  Pause,
  Mic,
  Video,
  Link,
  ArrowRight,
  ArrowLeft,
  Check,
  X,
  Lightbulb,
  List,
  History,
  BookOpen,
  Globe,
  Loader,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Info,
  Sliders,
  Shield,
  Sparkles,
  Flame,
  Eye as EyeIcon,
  Database
} from 'lucide-react';

// Shared Constants
const PLANET_SYMBOLS = {
  'Sun': '☉', 'Moon': '☽', 'Mercury': '☿', 'Venus': '♀', 
  'Mars': '♂', 'Jupiter': '♃', 'Saturn': '♄'
};

const planetSymbols = {
  'Sun': '☉', 'Moon': '☽', 'Mercury': '☿', 'Venus': '♀', 
  'Mars': '♂', 'Jupiter': '♃', 'Saturn': '♄'
};

// API Configuration
function getApiBaseUrl() {
  // Check for Vite env first, then Electron preload global, then sensible default
  return import.meta.env.VITE_API_BASE_URL || (typeof window !== 'undefined' && window.API_BASE_URL) || 'http://localhost:5000';
}

// Determine which reasoning format to request from the backend
const USE_REASONING_V1 = getUseReasoningV1();
if (typeof window !== 'undefined') {
  window.USE_REASONING_V1 = USE_REASONING_V1;
}

// API Service Layer
class VoxStellaAPI {
  static async request(endpoint, options = {}) {
    // Use HTTP requests
    const url = `${getApiBaseUrl()}${endpoint}`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(url, config);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP error! status: ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error(`API request failed: ${endpoint}`, error);
      throw error;
    }
  }

  static async calculateChart(chartData) {
    const endpoint = `/api/calculate-chart${USE_REASONING_V1 ? '?useReasoningV1=true' : ''}`;
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(chartData),
    });
  }

  static async getTimezone(location) {
    return this.request('/api/get-timezone', {
      method: 'POST',
      body: JSON.stringify({ location }),
    });
  }

  static async getCurrentTime(location) {
    return this.request('/api/current-time', {
      method: 'POST',
      body: JSON.stringify({ location }),
    });
  }

  static async getHealth() {
    return this.request('/api/health');
  }

  static async getVersion() {
    return this.request('/api/version');
  }
}

// Local Storage Service (Enhanced)
class StorageService {
  static migrateOldData() {
    // Migrate charts from old key
    const oldCharts = localStorage.getItem('horary_charts');
    const newCharts = localStorage.getItem('voxstella_charts');
    if (oldCharts && !newCharts) {
      localStorage.setItem('voxstella_charts', oldCharts);
      console.log('Migrated charts from horary_charts to voxstella_charts');
    }
    
    // Migrate notes from old key
    const oldNotes = localStorage.getItem('horary_notes');
    const newNotes = localStorage.getItem('vox_stella_notes');
    if (oldNotes && !newNotes) {
      localStorage.setItem('vox_stella_notes', oldNotes);
      console.log('Migrated notes from horary_notes to vox_stella_notes');
    }
    
    // Migrate settings from old key
    const oldSettings = localStorage.getItem('horary_settings');
    const newSettings = localStorage.getItem('vox_stella_settings');
    if (oldSettings && !newSettings) {
      localStorage.setItem('vox_stella_settings', oldSettings);
      console.log('Migrated settings from horary_settings to vox_stella_settings');
    }
  }

  static getCharts() {
    // Run migration on first access
    this.migrateOldData();
    
    try {
      const charts = JSON.parse(localStorage.getItem('voxstella_charts') || '[]');
      return charts.map(chart => ({
        ...chart,
        // Backfill confidence from verdict if missing (older saved charts)
        confidence: (chart.confidence ?? chart.verdict?.confidence ?? 0),
        timestamp: new Date(chart.timestamp),
        date: new Date(chart.timestamp).toISOString().split('T')[0]
      }));
    } catch {
      return [];
    }
  }

  static saveChart(chart) {
    const charts = this.getCharts();
    const newChart = {
      ...chart,
      id: Date.now(),
      timestamp: new Date(),
      date: new Date().toISOString().split('T')[0],
      tags: chart.tags && chart.tags.length ? chart.tags : ['general']
    };
    charts.unshift(newChart);
    localStorage.setItem('voxstella_charts', JSON.stringify(charts.slice(0, 100))); // Keep last 100
    return newChart;
  }

  static getNotes() {
    // Run migration on first access
    this.migrateOldData();
    
    try {
      return JSON.parse(localStorage.getItem('vox_stella_notes') || '{}');
    } catch {
      return {};
    }
  }

  static saveNote(chartId, note) {
    const notes = this.getNotes();
    notes[chartId] = note;
    localStorage.setItem('vox_stella_notes', JSON.stringify(notes));
  }

  static getSettings() {
    // Run migration on first access
    this.migrateOldData();
    
    try {
      return JSON.parse(localStorage.getItem('vox_stella_settings') || '{}');
    } catch {
      return {};
    }
  }

  static saveSetting(key, value) {
    const settings = this.getSettings();
    settings[key] = value;
    localStorage.setItem('vox_stella_settings', JSON.stringify(settings));
  }
}

// Helper function for sign from degree
const getSignFromDegree = (longitude) => {
  const signs = [
    'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
    'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'
  ];
  return signs[Math.floor((longitude % 360) / 30)];
};

// NEW: JudgmentBreakdown Component
const JudgmentBreakdown = ({ reasoning, darkMode }) => {
  // Always use the new flat table design (disable V1 timeline format)
  const useReasoningV1 = false;

  const getPlanetColor = (planet) => {
    const colors = {
      'Sun': 'text-yellow-500 dark:text-yellow-400',
      'Moon': 'text-gray-400 dark:text-gray-300', 
      'Mercury': 'text-orange-500 dark:text-orange-400',
      'Venus': 'text-green-500 dark:text-green-400',
      'Mars': 'text-red-500 dark:text-red-400',
      'Jupiter': 'text-blue-500 dark:text-blue-400',
      'Saturn': 'text-indigo-600 dark:text-indigo-400'
    };
    return colors[planet] || 'text-gray-600 dark:text-gray-400';
  };

  // Simple function to enhance text with planet symbols
  const renderTextWithPlanetSymbols = (text) => {
    // Split text by words and process each one
    const words = text.split(/(\s+)/); // Keep whitespace
    return words.map((word, index) => {
      // Check if this word matches a planet name
      const cleanWord = word.replace(/[^\w]/g, ''); // Remove punctuation for matching
      if (planetSymbols[cleanWord]) {
        const symbol = planetSymbols[cleanWord];
        const color = getPlanetColor(cleanWord);
        // Keep original punctuation by replacing only the planet name part
        const enhancedWord = word.replace(cleanWord, `${symbol} ${cleanWord}`);
        return (
          <span key={index} className={color}>
            {enhancedWord}
          </span>
        );
      }
      return word;
    });
  };

  // Clean reasoning text by removing parentheses and leading status emojis
  const cleanReasoningText = (text) => {
    if (typeof text !== 'string') return text;
    let t = text;
    // Remove parentheses and their contents
    t = t.replace(/\s*\([^)]*\)/g, '');
    // Remove leading status emojis (e.g., ❌, ✅, ⚠️) with optional spacing
    t = t.replace(/^\s*[❌✅⚠️]\s*/u, '');
    // Collapse extra spaces
    t = t.replace(/\s{2,}/g, ' ');
    return t.trim();
  };

  const renderReasoningText = (text) => {
    // Highlight question classification type with marked color
    if (typeof text === 'string') {
      const m = /^Question classified as\s+([A-Z_]+):\s*(.*)$/i.exec(text);
      if (m) {
        const rawType = m[1];
        const rest = m[2] ?? '';
        const TYPE = String(rawType).toUpperCase();
        // Display as Capitalized (or Title Case for multi-word)
        const displayType = String(rawType)
          .replace(/_/g, ' ')
          .toLowerCase()
          .replace(/\b\w/g, (c) => c.toUpperCase());
        const colorMap = {
          'QUALITY': 'text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/30',
          'OCCURRENCE': 'text-indigo-700 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-900/30',
          'OUTCOME': 'text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/30',
          'TIMING': 'text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/30',
          'RELATIONSHIP': 'text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-900/30',
          'TRAVEL': 'text-sky-700 dark:text-sky-300 bg-sky-100 dark:bg-sky-900/30'
        };
        const color = colorMap[TYPE] || 'text-indigo-700 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-900/30';

        return (
          <span>
            Question classified as{' '}
            <span className={`px-1.5 py-0.5 rounded font-semibold ${color}`}>
              {displayType}
            </span>
            {': '}
            {renderTextWithPlanetSymbols(cleanMoonText(rest))}
          </span>
        );
      }
    }

    // Handle both string and object formats for MOON_NEXT_DECISIVE
    const isMoonNextDecisive = (typeof text === 'string' && (text.startsWith('FLAG: MOON_NEXT_DECISIVE') || text === 'MOON_NEXT_DECISIVE')) ||
                               (typeof text === 'object' && text?.rule === 'MOON_NEXT_DECISIVE' && text?.stage === 'FLAG');
    
    if (isMoonNextDecisive) {
      return (
        <div className="bg-indigo-50 dark:bg-indigo-900/30 p-3 rounded-lg border border-indigo-200 dark:border-indigo-800">
          <div className="flex items-center">
            <span className="text-indigo-600 dark:text-indigo-400 font-semibold mr-2">🌙 Decisive Moon Aspect</span>
            <span className="text-xs bg-indigo-100 dark:bg-indigo-800 text-indigo-800 dark:text-indigo-200 px-2 py-1 rounded">
              Traditional Horary Key
            </span>
          </div>
        </div>
      );
    }
    
    // Clean text and enhance with planet symbols
    const cleanedText = cleanReasoningText(text);
    return renderTextWithPlanetSymbols(cleanMoonText(cleanedText));
  };

  // Transform reasoning depending on format
  const structuredReasoning = useMemo(() => {
    if (!reasoning) return [];
    
    // Handle V1 format (with entries array) but transform for table display
    if (reasoning && typeof reasoning === 'object' && Array.isArray(reasoning.entries)) {
      return reasoning.entries.map(entry => ({
        stage: entry.stage || 'General',
        rule: entry.rule || entry.text || entry,
        weight: entry.weight || 0,
      }));
    }
    
    if (!Array.isArray(reasoning) || reasoning.length === 0) return [];

    const first = reasoning[0];

    // Ledger entries from evaluate_chart
    if (first && typeof first === 'object' && 'key' in first) {
      return reasoning.map(item => {
        const signedWeight = item.polarity === 'NEGATIVE'
          ? -(item.weight || item.delta_no || 0)
          : (item.weight || item.delta_yes || 0);
        return {
          stage: item.stage || item.kind || 'General',
          rule: item.rule || item.key,
          weight: typeof signedWeight === 'number' ? signedWeight : Number(signedWeight) || 0,
        };
      });
    }

    // Already structured: ensure numeric weights
    if (first && typeof first === 'object' && 'stage' in first) {
      return reasoning.map(item => ({
        ...item,
        weight: typeof item.weight === 'number' ? item.weight : Number(item.weight) || 0,
      }));
    }

    // Parse plain text reasoning entries
    return reasoning.map(text => {
      const { rule, weight } = parseReasoningEntry(text);
      return { stage: 'General', rule, weight };
    });
  }, [reasoning, useReasoningV1]);

  // Debug: log reasoning rows to diagnose weight/stage parsing issues in UI
  useEffect(() => {
    try {
      const dbg = structuredReasoning.map(({ stage, rule, weight }) => ({ stage, rule, weight }));
      // Focus on items that might still carry inline percentages or retrograde markers
      const suspect = dbg.filter(x => /%|retrograde/i.test(String(x.rule)));
      if (suspect.length) {
        // eslint-disable-next-line no-console
        console.debug('[REASONING_DEBUG] suspect entries', suspect);
      }
    } catch (e) {
      // no-op
    }
  }, [structuredReasoning]);

  // Determine the maximum absolute weight for scaling
  const maxWeight = useMemo(() => {
    if (useReasoningV1) return 0;
    return structuredReasoning.reduce((max, item) => {
      const absWeight = Math.abs(item.weight || 0);
      return absWeight > max ? absWeight : max;
    }, 0);
  }, [structuredReasoning, useReasoningV1]);

  // Get category badge for each stage (uses rule text for context)
  const getCategoryBadge = (stage, ruleText = '') => {
    const t = String(ruleText || '').toLowerCase();
    
    if (stage === 'Question Classification') {
      return { label: 'QUALITY', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200' };
    }
    
    if (stage === 'Radicality') {
      if (t.includes('radical')) {
        return { label: 'Radical', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200' };
      }
      if (t.includes('too early') || t.includes('too late') || t.includes('saturn in 7') || t.includes('not radical') || t.includes('via combusta')) {
        return { label: 'Not radical', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200' };
      }
      return { label: 'Radicality', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' };
    }
    
    if (stage === 'Significators') {
      if (t.includes('shared') || t.includes('rules both houses') || t.includes('both houses')) {
        return { label: 'Shared', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200' };
      }
      return { label: 'Identified', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200' };
    }
    
    if (stage === 'Moon Testimony') {
      if (t.includes('not void')) {
        return { label: 'OK', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200' };
      }
      if (t.includes('void of course')) {
        return { label: 'Void', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200' };
      }
      return { label: 'Moon testimony', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' };
    }
    
    if (stage === 'Prohibition') {
      return { label: 'Prohibition', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200' };
    }
    
    if (stage === 'Perfection found' || stage === 'Perfection') {
      if (t.includes('collection')) {
        return { label: 'Collection', color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-200' };
      }
      if (t.includes('translation')) {
        return { label: 'Translation', color: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-200' };
      }
      if (t.includes('separat')) {
        return { label: 'Separating', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' };
      }
      if (t.includes('applies') || t.includes('applying')) {
        return { label: 'Applying', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200' };
      }
      return { label: 'Perfection', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200' };
    }
    
    return { label: 'General', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' };
  };

  // Get impact bar for weight
  const renderImpactBar = (weight) => {
    if (weight === 0) return null;
    
    const width = maxWeight ? Math.min((Math.abs(weight) / maxWeight) * 100, 100) : 0;
    const colorClass = weight > 0 ? 'bg-emerald-500' : 'bg-red-500';
    
    return (
      <div className="flex items-center space-x-2">
        <div className="w-16 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
          <div 
            className={`h-full ${colorClass} transition-all duration-300`}
            style={{ width: `${width}%` }}
          />
        </div>
        <span className={`text-xs font-semibold min-w-[24px] ${
          weight > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
        }`}>
          {weight > 0 ? '+' : ''}{weight}
        </span>
      </div>
    );
  };

  if (useReasoningV1) {
    return <div className="space-y-2">{renderReasoning(reasoning)}</div>;
  }

  // Flatten all reasoning entries into a single list
  const flattenedReasoning = structuredReasoning.map(item => ({
    ...item,
    badge: getCategoryBadge(item.stage, item.rule)
  }));

  return (
    <div className="space-y-3">
      {/* Header similar to Aspects table */}
      <div className="grid grid-cols-12 gap-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-2 border-b border-gray-200 dark:border-gray-700">
        <div className="col-span-6">Item</div>
        <div className="col-span-2">Status</div>
        <div className="col-span-2">Quality</div>
        <div className="col-span-2">Impact</div>
      </div>

      {/* Reasoning entries as table rows */}
      {flattenedReasoning.map((item, index) => (
        <div key={index} className="grid grid-cols-12 gap-4 items-center px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors duration-150">
          {/* Item column */}
          <div className="col-span-6">
            <div className="text-sm text-gray-900 dark:text-gray-100">
              {renderReasoningText(item.rule)}
            </div>
          </div>

          {/* Status column */}
          <div className="col-span-2">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${item.badge.color}`}>
              {item.badge.label}
            </span>
          </div>

          {/* Quality column */}
          <div className="col-span-2">
            <span className="text-sm text-gray-600 dark:text-gray-300">
              {item.weight > 0 ? 'Supports' : item.weight < 0 ? 'Opposes' : 'Neutral'}
            </span>
          </div>

          {/* Impact column */}
          <div className="col-span-2">
            {renderImpactBar(item.weight)}
          </div>
        </div>
      ))}
    </div>
  );
};

// Main App Component
const VoxStellaApp = () => {
  const [currentView, setCurrentView] = useState('dashboard');
  const [darkMode, setDarkMode] = useState(() => 
    StorageService.getSettings().darkMode ?? false
  );
  const [charts, setCharts] = useState([]);
  const [currentChart, setCurrentChart] = useState(null);
  const [notes, setNotes] = useState({});
  const [apiStatus, setApiStatus] = useState('checking');
  // Licensing (app-wide)
  const [license, setLicense] = useState({ active: false, plan: 'standard' });
  // In pure Vite dev (browser, no Electron), always unlock features for development convenience
  const isWebDev = (typeof window !== 'undefined') && !window.electronAPI && (import.meta && import.meta.env && import.meta.env.DEV);

  // Initialize data
  useEffect(() => {
    const savedCharts = StorageService.getCharts();
    const savedNotes = StorageService.getNotes();
    
    setCharts(savedCharts);
    setNotes(savedNotes);

    // Check API health
    checkApiHealth();

    // Load license status (or force-unlock in browser dev)
    try {
      if (isWebDev) {
        setLicense({ active: true, plan: 'dev' });
      } else if (window.electronAPI?.getLicenseStatus) {
        window.electronAPI.getLicenseStatus().then((s) => s && setLicense(s));
      }
    } catch (_) {}
  }, []);


  const checkApiHealth = async () => {
    try {
      await VoxStellaAPI.getHealth();
      setApiStatus('connected');
    } catch (error) {
      console.warn('API not available:', error);
      setApiStatus('offline');
    }
  };


  const toggleDarkMode = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    StorageService.saveSetting('darkMode', newMode);
  };

  const addNewChart = (chart) => {
    const savedChart = StorageService.saveChart(chart);
    setCharts(prev => [savedChart, ...prev]);
    return savedChart;
  };

  const updateNote = (chartId, note) => {
    StorageService.saveNote(chartId, note);
    setNotes(prev => ({ ...prev, [chartId]: note }));
  };

  const themeClasses = darkMode 
    ? 'bg-gray-900 text-white' 
    : 'bg-gradient-to-br from-slate-50 to-blue-50 text-gray-900';

  return (
    <div className={`min-h-screen transition-all duration-500 ${themeClasses}`}>
      {/* Header */}
      <Header 
        darkMode={darkMode} 
        toggleDarkMode={toggleDarkMode}
        currentView={currentView}
        setCurrentView={setCurrentView}
        apiStatus={apiStatus}
        onRefreshApi={checkApiHealth}
      />

      {/* Main Content */}
      <main className="pt-16 pb-20">
        {currentView === 'dashboard' && (
          <Dashboard 
            charts={charts} 
            setCurrentView={setCurrentView}
            setCurrentChart={setCurrentChart}
            darkMode={darkMode}
            apiStatus={apiStatus}
            licenseActive={!!license.active}
          />
        )}
        {currentView === 'cast-chart' && (
          <EnhancedChartCasting 
            setCurrentChart={setCurrentChart}
            setCurrentView={setCurrentView}
            darkMode={darkMode}
            apiStatus={apiStatus}
            onChartCreated={addNewChart}
            licenseActive={!!license.active}
          />
        )}
        {currentView === 'chart-view' && currentChart && (
          <ErrorBoundary>
          <EnhancedChartView
            chart={currentChart}
            darkMode={darkMode}
            notes={notes}
            setNotes={updateNote}
            licenseActive={!!license.active}
            setCurrentView={setCurrentView}
          />
          </ErrorBoundary>
        )}
        {currentView === 'timeline' && (
          <Timeline 
            charts={charts}
            setCurrentChart={setCurrentChart}
            setCurrentView={setCurrentView}
            darkMode={darkMode}
            licenseActive={!!license.active}
          />
        )}
        {currentView === 'notebook' && (
          <NotebookView 
            charts={charts}
            notes={notes}
            setNotes={updateNote}
            darkMode={darkMode}
            setCurrentChart={setCurrentChart}
            setCurrentView={setCurrentView}
            licenseActive={!!license.active}
          />
        )}
        {currentView === 'settings' && (
          <Settings
            darkMode={darkMode}
            toggleDarkMode={toggleDarkMode}
            setCurrentView={setCurrentView}
            apiStatus={apiStatus}
            onRefreshApi={checkApiHealth}
            onLicenseChanged={(s)=> setLicense(s)}
          />
        )}
      </main>

      {/* Footer */}
      <Footer 
        darkMode={darkMode} 
        currentView={currentView}
        setCurrentView={setCurrentView}
      />
    </div>
  );
};

// Header Component (Preserved)
const Header = ({ darkMode, toggleDarkMode, currentView, setCurrentView, apiStatus, onRefreshApi }) => {
  // Prefer ICO as requested; fall back to PNG if ICO fails to render
  const [logoSrc, setLogoSrc] = useState(appLogoIco);
  const headerBg = darkMode 
    ? 'bg-gray-800/90 backdrop-blur-xl border-gray-700' 
    : 'bg-white/90 backdrop-blur-xl border-white/20';

  const getStatusColor = () => {
    switch (apiStatus) {
      case 'connected': return 'text-emerald-500';
      case 'offline': return 'text-red-500';
      default: return 'text-amber-500';
    }
  };

  return (
    <header className={`fixed top-0 left-0 right-0 z-50 ${headerBg} border-b transition-all duration-300`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div className="flex items-center space-x-3">
            <img 
              src={logoSrc}
              onError={() => setLogoSrc(appLogoPng)}
              alt="Vox Stella" 
              className="h-10 w-auto"
            />
            {/* API Status Indicator */}
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${apiStatus === 'connected' ? 'bg-emerald-500' : apiStatus === 'offline' ? 'bg-red-500' : 'bg-amber-500 animate-pulse'}`} />
              <span className={`text-xs ${getStatusColor()}`}>
                {apiStatus === 'connected' ? 'API Connected' : 
                 apiStatus === 'offline' ? 'API Offline' : 'Checking...'}
              </span>
              {apiStatus === 'offline' && (
                <button onClick={onRefreshApi} className="text-xs text-blue-500 hover:text-blue-700">
                  <RefreshCw className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Unified Navigation Bar */}
          <UnifiedNavigationBar 
            currentView={currentView}
            setCurrentView={setCurrentView}
            darkMode={darkMode}
          />

          {/* Dark Mode Toggle */}
          <div className="flex items-center">
            <button 
              onClick={toggleDarkMode}
              className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
            >
              {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

// Custom Charts Icon Component for Total Charts
const TotalChartsIcon = ({ className }) => (
  <div className="relative w-5 h-5 flex items-center justify-center">
    <img 
      src={chartsPng} 
      alt="Total Charts" 
      className="w-6 h-6 object-contain"
      style={{ 
        filter: 'brightness(0) invert(1)',
        mixBlendMode: 'screen'
      }}
    />
  </div>
);

// Unified Navigation Bar Component
const UnifiedNavigationBar = ({ currentView, setCurrentView, darkMode }) => {
  const segments = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'cast-chart', label: 'Cast Chart', primary: true },
    { id: 'timeline', label: 'Timeline' },
    { id: 'notebook', label: 'Notebook' },
    { id: 'settings', label: 'Settings' },
  ];

  return (
    <div className="flex items-center bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-full px-4 py-2 shadow-sm border border-gray-200/50 dark:border-gray-700/50">
      <div className="flex items-center space-x-1">
        {segments.map(({ id, label, primary }) => {
          const isActive = currentView === id;
          
          return (
            <button
              key={id}
              onClick={() => setCurrentView(id)}
              className={`
                px-4 py-2 rounded-full font-medium transition-all duration-200 text-sm whitespace-nowrap
                ${isActive
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50'
                }
              `}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// Navigation Button Component (Enhanced)
const NavButton = ({ active, onClick, icon: Icon, text, customIcon }) => {
  const activeClasses = active 
    ? 'text-indigo-600 dark:text-indigo-400' 
    : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white';

  return (
    <button 
      onClick={onClick}
      className={`flex items-center space-x-2 py-2 px-3 rounded-lg transition-all duration-200 ${activeClasses}`}
    >
      {customIcon ? customIcon : <Icon className="w-4 h-4" />}
      <span className="font-medium">{text}</span>
    </button>
  );
};

// Dashboard Component (Preserved with enhanced API status)
const Dashboard = ({ charts, setCurrentView, setCurrentChart, darkMode, apiStatus, licenseActive=false }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterOutcome, setFilterOutcome] = useState('all');

  const cardBg = darkMode 
    ? 'bg-gray-800/40 backdrop-blur-xl border-gray-700' 
    : 'bg-white/40 backdrop-blur-xl border-white/60';

  const filteredCharts = useMemo(() => {
    return charts.filter(chart => {
      const matchesSearch = chart.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           (chart.querent && chart.querent.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesFilter = filterOutcome === 'all' || chart.outcome === filterOutcome;
      return matchesSearch && matchesFilter;
    });
  }, [charts, searchTerm, filterOutcome]);

  // Calculate statistics
  const stats = useMemo(() => {
    const total = charts.length;
    const positive = charts.filter(c => c.judgment === 'YES').length;
    const thisMonth = charts.filter(c => {
      const chartDate = new Date(c.timestamp);
      const now = new Date();
      return chartDate.getMonth() === now.getMonth() && chartDate.getFullYear() === now.getFullYear();
    }).length;
    const avgConfidence = total > 0 ? Math.round(charts.reduce((sum, c) => sum + (c.confidence || 0), 0) / total) : 0;

    return { total, positive, thisMonth, avgConfidence };
  }, [charts]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

      {/* Unified Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
        {/* Stat Cards */}
        <UnifiedCard
          icon={Clock}
          title="Total Charts"
          value={stats.total.toString()}
          type="stat"
          darkMode={darkMode}
        />
        <UnifiedCard
          icon={CheckCircle}
          title="Success Rate"
          value={`${stats.total > 0 ? Math.round((stats.positive / stats.total) * 100) : 0}%`}
          type="stat"
          darkMode={darkMode}
        />
        
        {/* Action Cards */}
        <UnifiedCard
          icon={Plus}
          title="Cast New Chart"
          type="action"
          onClick={() => setCurrentView('cast-chart')}
          darkMode={darkMode}
        />
        <UnifiedCard
          icon={TrendingUp}
          title="Timeline View"
          type="action"
          onClick={() => setCurrentView('timeline')}
          darkMode={darkMode}
        />
        <UnifiedCard
          icon={BookOpen}
          title="Notebook"
          type="action"
          onClick={() => setCurrentView('notebook')}
          darkMode={darkMode}
        />
      </div>

      {/* Search and Filter */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
          <h3 className="text-2xl font-bold">Recent Charts</h3>
          
          <div className="flex gap-4 items-center">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search charts..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`pl-10 pr-4 py-2 rounded-lg border transition-all duration-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                  darkMode 
                    ? 'bg-gray-700/50 border-gray-600 text-white placeholder-gray-400' 
                    : 'bg-white/70 border-gray-200 text-gray-900 placeholder-gray-500'
                }`}
              />
            </div>
            
            {/* Filter */}
            <select
              value={filterOutcome}
              onChange={(e) => setFilterOutcome(e.target.value)}
              className={`px-4 py-2 rounded-lg border transition-all duration-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                darkMode 
                  ? 'bg-gray-700/50 border-gray-600 text-white' 
                  : 'bg-white/70 border-gray-200 text-gray-900'
              }`}
            >
              <option value="all">All Outcomes</option>
              <option value="positive">Positive</option>
              <option value="negative">Negative</option>
              <option value="uncertain">Uncertain</option>
            </select>
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      {filteredCharts.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCharts.map((chart) => (
            <ChartCard 
              key={chart.id}
              chart={chart}
              onClick={() => {
                setCurrentChart(chart);
                setCurrentView('chart-view');
              }}
              darkMode={darkMode}
              licenseActive={licenseActive}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <HelpCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            {charts.length === 0 ? 'No charts yet' : 'No charts found'}
          </h3>
          <p className="text-gray-600 dark:text-gray-300 mb-4">
            {charts.length === 0 ? 
              'Cast your first horary chart to get started with enhanced traditional astrology.' :
              'Try adjusting your search terms or filters.'
            }
          </p>
          {charts.length === 0 && (
            <button
              onClick={() => setCurrentView('cast-chart')}
              className="bg-gradient-to-r from-teal-400 to-indigo-600 text-white px-6 py-3 rounded-lg font-medium hover:from-teal-500 hover:to-indigo-700 transition-all duration-300"
            >
              Cast Your First Chart
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// Unified Card Component (New Design)
const UnifiedCard = ({ icon: Icon, title, value, onClick, type = 'stat', darkMode }) => {
  const isAction = type === 'action';
  
  return (
    <div 
      className={`
        bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700
        ${isAction ? 'cursor-pointer hover:shadow-lg hover:scale-[1.02] transition-all duration-200' : ''}
      `}
      onClick={isAction ? onClick : undefined}
    >
      {/* Blue Icon Circle */}
      <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center mb-4">
        <Icon className="w-6 h-6 text-white" />
      </div>
      
      {/* Title */}
      <h3 className="text-lg font-semibold text-blue-600 dark:text-blue-400 mb-2">
        {title}
      </h3>
      
      {/* Value (for stats only) */}
      {value && (
        <p className="text-2xl font-bold text-gray-900 dark:text-white">
          {value}
        </p>
      )}
    </div>
  );
};


// Chart Card Component (Enhanced with solar conditions indicator)
const ChartCard = ({ chart, onClick, darkMode, licenseActive=false }) => {
  const cardBg = darkMode 
    ? 'bg-gray-800/60 backdrop-blur-xl border-gray-700 hover:bg-gray-800/80' 
    : 'bg-white/60 backdrop-blur-xl border-white/80 hover:bg-white/80';

  const getOutcomeColor = (judgment) => {
    switch (judgment) {
      case 'YES': return 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400';
      case 'NO': return 'text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400';
      default: return 'text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400';
    }
  };

  const getOutcomeEmoji = (judgment) => {
    switch (judgment) {
      case 'YES': return '✅';
      case 'NO': return '❌';
      default: return '❓';
    }
  };

  const getTagColor = (tag) => {
    const colors = {
      'career': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      'relationship': 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
      'finance': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      'health': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      'travel': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
      'family': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
      'property': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
      'education': 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
      'gambling': 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
      'default': 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
    };
    return colors[tag] || colors.default;
  };

  // NEW: Check for enhanced features
  const hasEnhancedFeatures = chart.solar_factors || chart.calculation_metadata?.enhanced_features_used;
  const hasSolarConditions = chart.chart_data?.solar_conditions_summary?.significant_conditions > 0;

  return (
    <button 
      onClick={onClick}
      className={`${cardBg} border rounded-2xl p-6 text-left transition-all duration-300 hover:scale-[1.02] hover:shadow-lg`}
    >
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center space-x-2">
          <span className="text-2xl">{getOutcomeEmoji(chart.judgment)}</span>
          {/* NEW: Enhanced features indicators */}
          {hasEnhancedFeatures && (
            <div className="flex items-center space-x-1">
              <Sparkles className="w-4 h-4 text-indigo-500" title="Enhanced Analysis" />
            </div>
          )}
          {hasSolarConditions && (
            <div className="flex items-center space-x-1">
              <Sun className="w-4 h-4 text-yellow-500" title="Solar Conditions Present" />
            </div>
          )}
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-medium ${licenseActive ? getOutcomeColor(chart.judgment) : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-300'}`}>
          {licenseActive ? chart.judgment : 'Locked'}
        </span>
      </div>
      
      <h4 className="font-semibold mb-2 line-clamp-2">{chart.question}</h4>
      
      <div className="flex justify-between items-center text-sm text-gray-600 dark:text-gray-300 mb-3">
        <span>{new Date(chart.timestamp).toLocaleDateString()}</span>
        <span>Confidence: {licenseActive ? `${chart.confidence}%` : '—'}</span>
      </div>

      {/* Tags */}
      {chart.tags && chart.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {chart.tags.slice(0, 2).map(tag => (
            <span key={tag} className={`px-2 py-1 rounded text-xs ${getTagColor(tag)}`}>
              {tag}
            </span>
          ))}
          {chart.tags.length > 2 && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              +{chart.tags.length - 2} more
            </span>
          )}
        </div>
      )}
      
      <div className="flex justify-end">
        <ChevronRight className="w-4 h-4 text-gray-400" />
      </div>
    </button>
  );
};

// Enhanced timezone detection using backend API
const getTimezoneFromLocation = async (location) => {
  if (!location) return 'America/New_York'; // Default
  
  try {
    // Use the backend API for accurate timezone detection
    const response = await VoxStellaAPI.getTimezone(location);
    
    if (response.success && response.timezone) {
      console.log(`Backend timezone detection: ${location} → ${response.timezone}`);
      return response.timezone;
    } else {
      console.warn('Backend timezone detection failed, using fallback');
    }
  } catch (error) {
    console.warn('Backend timezone detection error:', error);
  }
  
  // Fallback to simplified mapping for offline/error cases
  return getTimezoneFromLocationFallback(location);
};

// Simplified fallback function (reduced hardcoded list)
const getTimezoneFromLocationFallback = (location) => {
  const locationLower = location.toLowerCase().trim();
  
  // Simplified country-based fallbacks only
  if (locationLower.includes('usa') || locationLower.includes('united states')) {
    return 'America/New_York'; // Default to Eastern (backend will provide accurate detection)
  }
  if (locationLower.includes('uk') || locationLower.includes('united kingdom') || locationLower.includes('england')) {
    return 'Europe/London';
  }
  if (locationLower.includes('israel') || locationLower.includes('ישראל')) {
    return 'Asia/Jerusalem';
  }
  if (locationLower.includes('france')) {
    return 'Europe/Paris';
  }
  if (locationLower.includes('germany')) {
    return 'Europe/Berlin';
  }
  if (locationLower.includes('australia')) {
    return 'Australia/Sydney';
  }
  if (locationLower.includes('canada')) {
    return 'America/Toronto';
  }
  if (locationLower.includes('japan')) {
    return 'Asia/Tokyo';
  }
  if (locationLower.includes('china')) {
    return 'Asia/Shanghai';
  }
  if (locationLower.includes('india')) {
    return 'Asia/Kolkata';
  }
  
  // Default fallback
  return 'America/New_York';
};

// Enhanced Chart Casting Component
const EnhancedChartCasting = ({ setCurrentChart, setCurrentView, darkMode, apiStatus, onChartCreated }) => {
  const [question, setQuestion] = useState('');
  const [location, setLocation] = useState('');
  const [useCurrentTime, setUseCurrentTime] = useState(true);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [timezone, setTimezone] = useState('America/New_York');
  const [useManualTimezone, setUseManualTimezone] = useState(false);
  const [useManualHouses, setUseManualHouses] = useState(false);
  const [manualHouses, setManualHouses] = useState('1,7');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [locationSuggestions, setLocationSuggestions] = useState([]);
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);

  // NEW: Enhanced options state
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [advancedOptions, setAdvancedOptions] = useState({
    ignoreRadicality: false,
    ignoreVoidMoon: false,
    ignoreCombustion: false,
    ignoreSaturn7th: false,
    exaltationConfidenceBoost: 15.0
  });

  const cardBg = darkMode 
    ? 'bg-gray-800/60 backdrop-blur-xl border-gray-700' 
    : 'bg-white/60 backdrop-blur-xl border-white/80';

  // Location suggestions (preserved)
  const commonLocations = [
    'London, UK', 'New York, NY, USA', 'Los Angeles, CA, USA', 'Paris, France',
    'Berlin, Germany', 'Tokyo, Japan', 'Sydney, Australia', 'Toronto, Canada'
  ];

  // Auto-update timezone when location changes (only if not using manual timezone)
  useEffect(() => {
    let timeoutId;
    if (location.trim() && !useManualTimezone) {
      timeoutId = setTimeout(() => {
        getTimezoneFromLocation(location).then(detectedTimezone => {
          if (detectedTimezone !== timezone) {
            setTimezone(detectedTimezone);
          }
        }).catch(error => {
          console.warn('Timezone detection failed:', error);
          // Keep current timezone on error
        });
      }, 300);
    }
    return () => clearTimeout(timeoutId);
  }, [location, useManualTimezone]);

  const handleLocationChange = (value) => {
    setLocation(value);
    if (value.length > 2) {
      const filtered = commonLocations.filter(loc => 
        loc.toLowerCase().includes(value.toLowerCase())
      );
      setLocationSuggestions(filtered);
      setShowLocationSuggestions(filtered.length > 0);
    } else {
      setShowLocationSuggestions(false);
    }
  };

  const handleSubmit = async () => {
    if (!question.trim() || !location.trim()) {
      setError('Please fill in all required fields');
      return;
    }

    if (!useCurrentTime && (!date || !time)) {
      setError('Please specify date and time or use current time');
      return;
    }

    if (useManualHouses && !manualHouses.trim()) {
      setError('Please specify manual houses or disable manual house selection');
      return;
    }

    // Validate date/time when not using current time
    if (!useCurrentTime) {
      if (!date) {
        setError('Please enter a date or use current time');
        return;
      }
      if (!time) {
        setError('Please enter a time or use current time');
        return;
      }
    }

    // Convert HTML date input (YYYY-MM-DD) to DD/MM/YYYY format for backend
    const convertDateFormat = (htmlDate) => {
      if (!htmlDate) return null;
      const [year, month, day] = htmlDate.split('-');
      return `${day}/${month}/${year}`;
    };

    setLoading(true);
    setError('');
    
    try {
      const requestBody = {
        question: question.trim(),
        location: location.trim(),
        useCurrentTime,
        ...(date && { date: convertDateFormat(date) }),
        ...(time && { time }),
        ...(timezone && { timezone }),
        ...(useManualHouses && manualHouses && { manualHouses: manualHouses.trim() }),
        // NEW: Include enhanced options if API is connected
        ...(apiStatus === 'connected' && {
          ignoreRadicality: advancedOptions.ignoreRadicality,
          ignoreVoidMoon: advancedOptions.ignoreVoidMoon,
          ignoreCombustion: advancedOptions.ignoreCombustion,
          ignoreSaturn7th: advancedOptions.ignoreSaturn7th,
          exaltationConfidenceBoost: advancedOptions.exaltationConfidenceBoost
        })
      };

      console.log('Sending enhanced request:', requestBody);

      let result;
      if (apiStatus === 'connected') {
        try {
          result = await VoxStellaAPI.calculateChart(requestBody);
          console.log('Enhanced API response:', result);
        } catch (apiError) {
          console.warn('Enhanced API failed, using offline mode:', apiError);
          throw apiError;
        }
      } else {
        throw new Error('API offline');
      }
      
      // Process successful API response
      const category = result?.question_analysis?.question_type
        ? result.question_analysis.question_type.toLowerCase().replace(/_/g, ' ')
        : 'general';

      // CRITICAL BUG FIX: Validate and bulletproof aspect data
      const validateAspectData = (chartData) => {
        if (!chartData?.aspects) return chartData;
        
        chartData.aspects = chartData.aspects.map(aspect => ({
          ...aspect,
          applying: Boolean(aspect.applying) // Ensure applying is always a proper boolean
        }));
        
        return chartData;
      };

      // Helper: derive confidence from breakdown or scoring trace if missing
      const computeFallbackConfidence = (res) => {
        try {
          if (res?.confidence_breakdown?.final_confidence != null) {
            return Math.round(res.confidence_breakdown.final_confidence);
          }
          const trace = res?.scoring_trace || [];
          if (trace.length > 0) {
            const total = trace.reduce((sum, t) => sum + (Number(t.weight) || 0), 0);
            const sigmoid = (x) => 100 / (1 + Math.exp(-x));
            return Math.round(sigmoid(total));
          }
        } catch {}
        return 0;
      };

      const processedChart = {
        ...result,
        chart_data: validateAspectData(result.chart_data), // Validate aspect data
        confidence: result.confidence,
        confidence_breakdown: result.confidence_breakdown || null,
        scoring_trace: result.scoring_trace || null,
        id: Date.now(),
        timestamp: new Date(),
        tags: [category],
        outcome: result.judgment === 'YES' ? 'positive' :
                result.judgment === 'NO' ? 'negative' : 'uncertain'
      };

      const savedChart = onChartCreated(processedChart);
      console.log('CHART PROCESSED:', savedChart.chart_data?.aspects?.find(a => a.planet1 === 'Mercury' && a.planet2 === 'Mars') || 'No Mercury-Mars aspect found');
      setCurrentChart(savedChart);
      setCurrentView('chart-view');

    } catch (error) {
      console.warn('Creating enhanced demo chart due to:', error.message);
      
      // Create enhanced demo chart
      const demoChart = createEnhancedDemoChart(requestBody);
      const savedChart = onChartCreated(demoChart);
      setCurrentChart(savedChart);
      setCurrentView('chart-view');
    } finally {
      setLoading(false);
    }
  };

  const createEnhancedDemoChart = (requestData) => {
    const judgments = ['YES', 'NO', 'UNCLEAR'];
    const randomJudgment = judgments[Math.floor(Math.random() * judgments.length)];
    
    const baseChart = {
      question: requestData.question,
      judgment: randomJudgment,
      confidence: Math.floor(Math.random() * 40) + 60,
      tags: ['general'],
      reasoning: [
        "Chart is radical - Ascendant at 15.3°",
        `Significators identified: ${requestData.manualHouses ? `Manual houses ${requestData.manualHouses}` : 'Traditional house rulers'}`,
        "Enhanced future retrograde protection applied",
        "Enhanced solar conditions analyzed",
        Math.random() > 0.5 ? "Mutual reception strengthens the matter" : "No major impediments found",
        "Enhanced reception weighting considered"
      ],
      chart_data: {
        planets: {
          Sun: { longitude: 67.5, sign: 'Gemini', house: 10, dignity_score: 1 },
          Moon: { longitude: 145.2, sign: 'Leo', house: 1, dignity_score: 3 },
          Mercury: { longitude: 69.1, sign: 'Gemini', house: 10, dignity_score: 4 },
          Venus: { longitude: 45.7, sign: 'Taurus', house: 9, dignity_score: 5 },
          Mars: { longitude: 123.4, sign: 'Leo', house: 1, dignity_score: 2 },
          Jupiter: { longitude: 234.6, sign: 'Scorpio', house: 4, dignity_score: -1 },
          Saturn: { longitude: 298.8, sign: 'Capricorn', house: 6, dignity_score: 4 }
        },
        aspects: [
          { planet1: 'Venus', planet2: 'Mars', aspect: 'Trine', orb: 3.2, applying: true },
          { planet1: 'Sun', planet2: 'Mercury', aspect: 'Conjunction', orb: 1.6, applying: false },
          { planet1: 'Mercury', planet2: 'Mars', aspect: 'Sextile', orb: 3.9, applying: false } // BUG FIX: Add Mercury-Mars separating
        ],
        ascendant: 67.5,
        houses: Array.from({length: 12}, (_, i) => i * 30),
        // NEW: Enhanced solar conditions
        solar_conditions_summary: {
          cazimi_planets: Math.random() > 0.7 ? [{ planet: 'Mercury', distance_from_sun: 0.2, exact_cazimi: true }] : [],
          combusted_planets: Math.random() > 0.8 ? [{ planet: 'Venus', traditional_exception: false }] : [],
          under_beams_planets: Math.random() > 0.6 ? [{ planet: 'Mars' }] : [],
          free_planets: [
            { planet: 'Sun' }, { planet: 'Moon' }, { planet: 'Jupiter' }, { planet: 'Saturn' }
          ],
          significant_conditions: Math.random() > 0.5 ? 1 : 0
        },
        timezone_info: {
          local_time: new Date().toISOString(),
          timezone: requestData.location || 'Unknown timezone',
          location_name: requestData.location || 'Unknown location',
          coordinates: {
            latitude: 40.7128,
            longitude: -74.0060
          }
        }
      },
      // NEW: Enhanced factors
      solar_factors: {
        significant: Math.random() > 0.5,
        summary: Math.random() > 0.7 ? "Cazimi: Mercury" : "No significant solar conditions",
        cazimi_count: Math.random() > 0.7 ? 1 : 0,
        combustion_count: Math.random() > 0.8 ? 1 : 0,
        under_beams_count: 0
      },
      traditional_factors: {
        perfection_type: Math.random() > 0.5 ? "direct" : "translation",
        reception: Math.random() > 0.6 ? "mutual_reception" : "none"
      },
      // NEW: Enhanced metadata
      calculation_metadata: {
        api_version: '2.0.0',
        enhanced_features_used: {
          future_retrograde_checks: true,
          directional_motion_awareness: true,
          enhanced_solar_conditions: true,
          reception_weighting_nuance: true
        },
        override_flags_applied: requestData.ignoreRadicality ? {
          ignore_radicality: requestData.ignoreRadicality,
          ignore_void_moon: requestData.ignoreVoidMoon,
          ignore_combustion: requestData.ignoreCombustion,
          ignore_saturn_7th: requestData.ignoreSaturn7th
        } : {}
      },
      timezone_info: {
        local_time: new Date().toISOString(),
        timezone: requestData.location || 'Unknown timezone',
        location_name: requestData.location || 'Unknown location'
      },
      location_name: requestData.location || 'Unknown location',
      outcome: randomJudgment === 'YES' ? 'positive' : 
               randomJudgment === 'NO' ? 'negative' : 'uncertain',
      enhanced: true,
      demo: true
    };

    return {
      ...baseChart,
      general_info: deriveGeneralInfo(baseChart),
      considerations: deriveConsiderations(baseChart, requestData)
    };
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h2 className="text-3xl font-bold mb-2">Cast a Horary Chart</h2>
        <p className="text-gray-600 dark:text-gray-300">
          Ask a clear, specific question and let the traditional wisdom guide your answer.
        </p>
        {apiStatus === 'offline' && (
          <div className="mt-4 p-3 bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 rounded-lg">
            <p className="text-amber-700 dark:text-amber-300 text-sm">
              <AlertCircle className="w-4 h-4 inline mr-2" />
              API offline - Demo chart will be created with enhanced features. Chart will be saved locally.
            </p>
          </div>
        )}
        {apiStatus === 'connected' && (
          <div className="mt-4 p-3 bg-emerald-100 dark:bg-emerald-900/30 border border-emerald-300 dark:border-emerald-700 rounded-lg">
            <p className="text-emerald-700 dark:text-emerald-300 text-sm">
              Horary Engine Available
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-xl">
          <div className="flex items-center">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mr-2" />
            <span className="text-red-700 dark:text-red-300">{error}</span>
          </div>
        </div>
      )}

      <div className={`${cardBg} border rounded-2xl p-8`}>
        <div className="space-y-6">
          {/* Question Input (Preserved) */}
          <div>
            <label className="block text-sm font-medium mb-3">
              Your Question <span className="text-red-500">*</span>
            </label>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Will I get the job I interviewed for?"
              className={`w-full p-4 rounded-xl border transition-all duration-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none ${
                darkMode 
                  ? 'bg-gray-700/50 border-gray-600 text-white placeholder-gray-400' 
                  : 'bg-white/70 border-gray-200 text-gray-900 placeholder-gray-500'
              }`}
              rows={3}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Ask a specific, answerable question that matters to you right now.
            </p>
          </div>

          {/* Location Input (Preserved) */}
          <div className="relative">
            <label className="block text-sm font-medium mb-3">
              Location <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={location}
                onChange={(e) => handleLocationChange(e.target.value)}
                onFocus={() => location.length > 2 && setShowLocationSuggestions(true)}
                onBlur={() => setTimeout(() => setShowLocationSuggestions(false), 200)}
                placeholder="London, UK"
                className={`w-full pl-10 pr-4 py-3 rounded-xl border transition-all duration-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                  darkMode 
                    ? 'bg-gray-700/50 border-gray-600 text-white placeholder-gray-400' 
                    : 'bg-white/70 border-gray-200 text-gray-900 placeholder-gray-500'
                }`}
              />
              
              {/* Location Suggestions (Preserved) */}
              {showLocationSuggestions && (
                <div className={`absolute top-full left-0 right-0 mt-1 border rounded-lg shadow-lg z-10 ${
                  darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'
                }`}>
                  {locationSuggestions.map((suggestion, index) => (
                    <button
                      key={index}
                      onClick={() => {
                        setLocation(suggestion);
                        setShowLocationSuggestions(false);
                      }}
                      className={`w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 first:rounded-t-lg last:rounded-b-lg ${
                        darkMode ? 'text-white' : 'text-gray-900'
                      }`}
                    >
                      <Globe className="w-4 h-4 inline mr-2 text-gray-400" />
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Time Settings (Preserved) */}
          <div>
            <label className="block text-sm font-medium mb-3">Time</label>
            <div className="space-y-4">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="radio"
                  checked={useCurrentTime}
                  onChange={() => setUseCurrentTime(true)}
                  className="w-4 h-4 text-indigo-600 focus:ring-indigo-500"
                />
                <span>Use current time</span>
              </label>
              
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="radio"
                  checked={!useCurrentTime}
                  onChange={() => setUseCurrentTime(false)}
                  className="w-4 h-4 text-indigo-600 focus:ring-indigo-500"
                />
                <span>Specify custom time</span>
              </label>

              {!useCurrentTime && (
                <div className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-gray-600 dark:text-gray-300 mb-2">Date</label>
                      <input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className={`w-full p-3 rounded-xl border transition-all duration-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                          darkMode 
                            ? 'bg-gray-700/50 border-gray-600 text-white' 
                            : 'bg-white/70 border-gray-200 text-gray-900'
                        }`}
                        required
                      />
                      <p className="text-xs text-gray-500 mt-1">Use the date picker or DD/MM/YYYY format (e.g., 02/03/2004 for March 2, 2004)</p>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 dark:text-gray-300 mb-2">Time</label>
                      <input
                        type="time"
                        value={time}
                        onChange={(e) => setTime(e.target.value)}
                        className={`w-full p-3 rounded-xl border transition-all duration-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                          darkMode 
                            ? 'bg-gray-700/50 border-gray-600 text-white' 
                            : 'bg-white/70 border-gray-200 text-gray-900'
                        }`}
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm text-gray-600 dark:text-gray-300">
                        Timezone 
                        <span className="text-xs font-normal text-gray-500 ml-1">
                          {useManualTimezone ? '(manual)' : '(auto-detected from location)'}
                        </span>
                      </label>
                      <button
                        type="button"
                        onClick={() => setUseManualTimezone(!useManualTimezone)}
                        className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
                      >
                        {useManualTimezone ? 'Use Auto-Detect' : 'Manual Override'}
                      </button>
                    </div>
                    
                    {useManualTimezone ? (
                      <select
                        value={timezone}
                        onChange={(e) => setTimezone(e.target.value)}
                        className={`w-full p-3 rounded-xl border transition-all duration-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                          darkMode 
                            ? 'bg-gray-700/50 border-gray-600 text-white' 
                            : 'bg-white/70 border-gray-200 text-gray-900'
                        }`}
                      >
                        <optgroup label="North America">
                          <option value="America/New_York">Eastern Time (EST/EDT)</option>
                          <option value="America/Chicago">Central Time (CST/CDT)</option>
                          <option value="America/Denver">Mountain Time (MST/MDT)</option>
                          <option value="America/Los_Angeles">Pacific Time (PST/PDT)</option>
                          <option value="America/Phoenix">Arizona Time (MST)</option>
                          <option value="America/Anchorage">Alaska Time (AKST/AKDT)</option>
                          <option value="Pacific/Honolulu">Hawaii Time (HST)</option>
                          <option value="America/Toronto">Toronto (EST/EDT)</option>
                          <option value="America/Vancouver">Vancouver (PST/PDT)</option>
                          <option value="America/Edmonton">Edmonton (MST/MDT)</option>
                        </optgroup>
                        <optgroup label="Europe">
                          <option value="Europe/London">London (GMT/BST)</option>
                          <option value="Europe/Paris">Paris (CET/CEST)</option>
                          <option value="Europe/Berlin">Berlin (CET/CEST)</option>
                          <option value="Europe/Rome">Rome (CET/CEST)</option>
                          <option value="Europe/Madrid">Madrid (CET/CEST)</option>
                          <option value="Europe/Amsterdam">Amsterdam (CET/CEST)</option>
                          <option value="Europe/Vienna">Vienna (CET/CEST)</option>
                          <option value="Europe/Zurich">Zurich (CET/CEST)</option>
                          <option value="Europe/Stockholm">Stockholm (CET/CEST)</option>
                          <option value="Europe/Copenhagen">Copenhagen (CET/CEST)</option>
                          <option value="Europe/Oslo">Oslo (CET/CEST)</option>
                          <option value="Europe/Helsinki">Helsinki (EET/EEST)</option>
                          <option value="Europe/Dublin">Dublin (GMT/IST)</option>
                          <option value="Europe/Brussels">Brussels (CET/CEST)</option>
                          <option value="Europe/Lisbon">Lisbon (WET/WEST)</option>
                          <option value="Europe/Athens">Athens (EET/EEST)</option>
                          <option value="Europe/Prague">Prague (CET/CEST)</option>
                          <option value="Europe/Budapest">Budapest (CET/CEST)</option>
                          <option value="Europe/Warsaw">Warsaw (CET/CEST)</option>
                          <option value="Europe/Moscow">Moscow (MSK)</option>
                        </optgroup>
                        <optgroup label="Asia">
                          <option value="Asia/Tokyo">Tokyo (JST)</option>
                          <option value="Asia/Shanghai">Beijing/Shanghai (CST)</option>
                          <option value="Asia/Hong_Kong">Hong Kong (HKT)</option>
                          <option value="Asia/Singapore">Singapore (SGT)</option>
                          <option value="Asia/Kolkata">India (IST)</option>
                          <option value="Asia/Bangkok">Bangkok (ICT)</option>
                          <option value="Asia/Seoul">Seoul (KST)</option>
                          <option value="Asia/Manila">Manila (PST)</option>
                          <option value="Asia/Jakarta">Jakarta (WIB)</option>
                          <option value="Asia/Kuala_Lumpur">Kuala Lumpur (MYT)</option>
                          <option value="Asia/Taipei">Taipei (CST)</option>
                          <option value="Asia/Dubai">Dubai (GST)</option>
                          <option value="Asia/Jerusalem">Jerusalem (IST)</option>
                        </optgroup>
                        <optgroup label="Australia & Oceania">
                          <option value="Australia/Sydney">Sydney (AEDT/AEST)</option>
                          <option value="Australia/Melbourne">Melbourne (AEDT/AEST)</option>
                          <option value="Australia/Brisbane">Brisbane (AEST)</option>
                          <option value="Australia/Perth">Perth (AWST)</option>
                          <option value="Pacific/Auckland">Auckland (NZDT/NZST)</option>
                        </optgroup>
                        <optgroup label="Other">
                          <option value="UTC">UTC (Coordinated Universal Time)</option>
                        </optgroup>
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={timezone}
                        readOnly
                        className={`w-full p-3 rounded-xl border transition-all duration-200 ${
                          darkMode 
                            ? 'bg-gray-700/30 border-gray-600 text-white cursor-not-allowed' 
                            : 'bg-gray-50 border-gray-200 text-gray-700 cursor-not-allowed'
                        }`}
                        placeholder="Enter location above to auto-detect timezone"
                      />
                    )}
                    
                    <p className="text-xs text-gray-500 mt-1">
                      {useManualTimezone 
                        ? 'Manually selected timezone' 
                        : 'Timezone is automatically detected based on your location input'
                      }
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Manual House Selection (Preserved) */}
          <div>
            <label className="block text-sm font-medium mb-3">House Assignment (Optional)</label>
            <div className="space-y-4">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="radio"
                  checked={!useManualHouses}
                  onChange={() => setUseManualHouses(false)}
                  className="w-4 h-4 text-indigo-600 focus:ring-indigo-500"
                />
                <span>Automatic (recommended) - Let AI analyze the question</span>
              </label>
              
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="radio"
                  checked={useManualHouses}
                  onChange={() => setUseManualHouses(true)}
                  className="w-4 h-4 text-indigo-600 focus:ring-indigo-500"
                />
                <span>Manual house assignment</span>
              </label>

              {useManualHouses && (
                <div className="mt-4">
                  <label className="block text-sm text-gray-600 dark:text-gray-300 mb-2">
                    Houses (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={manualHouses}
                    onChange={(e) => setManualHouses(e.target.value)}
                    placeholder="1,7"
                    className={`w-full p-3 rounded-xl border transition-all duration-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                      darkMode 
                        ? 'bg-gray-700/50 border-gray-600 text-white placeholder-gray-400' 
                        : 'bg-white/70 border-gray-200 text-gray-900 placeholder-gray-500'
                    }`}
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    Example: "1,7" for querent (1st house) and partner/enemy (7th house).<br/>
                    Common patterns: 1,2 (money), 1,5 (children), 1,10 (career), 1,4 (home)
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* NEW: Advanced Options (Enhanced Features) */}
          {apiStatus === 'connected' && (
            <div>
              <button
                type="button"
                onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                className="flex items-center justify-between w-full p-4 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 hover:border-indigo-500 dark:hover:border-indigo-400 transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <Sliders className="w-5 h-5 text-indigo-500" />
                  <div className="text-left">
                    <div className="font-medium">Advanced Options</div>
                    <div className="text-sm text-gray-600 dark:text-gray-300">
                      Enhanced engine overrides and reception weighting
                    </div>
                  </div>
                </div>
                {showAdvancedOptions ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
              </button>

              {showAdvancedOptions && (
                <div className="mt-4 p-6 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/30 space-y-6">
                  <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-300 mb-4">
                    <Info className="w-4 h-4" />
                    <span>These options override traditional restrictions. Use with caution and expertise.</span>
                  </div>

                  {/* Override Flags */}
                  <div>
                    <h4 className="font-medium mb-3 flex items-center">
                      <Shield className="w-4 h-4 mr-2" />
                      Warning Overrides & Confidence Restoration
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <label className="flex items-center space-x-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={advancedOptions.ignoreRadicality}
                          onChange={(e) => setAdvancedOptions(prev => ({
                            ...prev, ignoreRadicality: e.target.checked
                          }))}
                          className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 rounded"
                        />
                        <div>
                          <span className="font-medium">Override Radicality Warnings</span>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            Remove cautions and restore full confidence
                          </div>
                        </div>
                      </label>

                      <label className="flex items-center space-x-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={advancedOptions.ignoreVoidMoon}
                          onChange={(e) => setAdvancedOptions(prev => ({
                            ...prev, ignoreVoidMoon: e.target.checked
                          }))}
                          className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 rounded"
                        />
                        <div>
                          <span className="font-medium">Override Void Moon Warnings</span>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            Proceed with full confidence despite void status
                          </div>
                        </div>
                      </label>

                      <label className="flex items-center space-x-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={advancedOptions.ignoreCombustion}
                          onChange={(e) => setAdvancedOptions(prev => ({
                            ...prev, ignoreCombustion: e.target.checked
                          }))}
                          className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 rounded"
                        />
                        <div>
                          <span className="font-medium">Override Combustion Penalties</span>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            Ignore solar condition dignity reductions
                          </div>
                        </div>
                      </label>

                      <label className="flex items-center space-x-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={advancedOptions.ignoreSaturn7th}
                          onChange={(e) => setAdvancedOptions(prev => ({
                            ...prev, ignoreSaturn7th: e.target.checked
                          }))}
                          className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 rounded"
                        />
                        <div>
                          <span className="font-medium">Override Saturn 7th Warnings</span>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            Ignore traditional astrologer error caution
                          </div>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* Reception Weighting */}
                  <div>
                    <h4 className="font-medium mb-3 flex items-center">
                      <Sparkles className="w-4 h-4 mr-2" />
                      Reception Weighting
                    </h4>
                    <div>
                      <label className="block text-sm text-gray-600 dark:text-gray-300 mb-2">
                        Exaltation Confidence Boost (%)
                      </label>
                      <div className="flex items-center space-x-4">
                        <input
                          type="range"
                          min="0"
                          max="30"
                          step="5"
                          value={advancedOptions.exaltationConfidenceBoost}
                          onChange={(e) => setAdvancedOptions(prev => ({
                            ...prev, exaltationConfidenceBoost: parseFloat(e.target.value)
                          }))}
                          className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                        />
                        <span className="text-sm font-mono w-12 text-center">
                          {advancedOptions.exaltationConfidenceBoost}%
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Additional confidence boost for mutual exaltation reception (default: 15%)
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Submit Button */}
          <button
            onClick={handleSubmit}
            disabled={loading || !question.trim() || !location.trim()}
            className="w-full bg-gradient-to-r from-teal-400 to-indigo-600 text-white py-4 px-6 rounded-xl font-semibold transition-all duration-300 hover:from-teal-500 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
          >
            {loading ? (
              <>
                <Loader className="w-5 h-5 animate-spin" />
                <span>Casting Chart...</span>
              </>
            ) : (
              <>
                <span>Cast Chart</span>
              </>
            )}
          </button>

          {/* Help Text */}
          <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
            <p>
              {apiStatus === 'connected' ? 
                'Chart will be calculated using Enhanced Horary Engine with advanced traditional features.' :
                'API offline - Demo chart will be created for testing.'
              }
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// Confidence Bar Component
// Animates once per chart load (when chartId changes), not on tab switches
// NEW: Arch Gauge Component for judgment visualization
const ArchGauge = ({ judgment, confidence, darkMode }) => {
  const [animatedConfidence, setAnimatedConfidence] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedConfidence(confidence || 0);
    }, 100);
    return () => clearTimeout(timer);
  }, [confidence]);

  const getArchColors = (judgment) => {
    switch (judgment) {
      case 'YES': return {
        primary: '#10b981', // emerald-500
        secondary: '#059669', // emerald-600
        light: '#d1fae5', // emerald-100
        segments: ['#ecfdf5', '#d1fae5', '#a7f3d0', '#6ee7b7', '#34d399', '#10b981', '#059669', '#047857']
      };
      case 'NO': return {
        primary: '#ef4444', // red-500
        secondary: '#dc2626', // red-600
        light: '#fee2e2', // red-100
        segments: ['#fef2f2', '#fee2e2', '#fecaca', '#fca5a5', '#f87171', '#ef4444', '#dc2626', '#b91c1c']
      };
      default: return {
        primary: '#f59e0b', // amber-500
        secondary: '#d97706', // amber-600
        light: '#fef3c7', // amber-100
        segments: ['#fffbeb', '#fef3c7', '#fde68a', '#fcd34d', '#fbbf24', '#f59e0b', '#d97706', '#b45309']
      };
    }
  };

  const colors = getArchColors(judgment);
  const radius = 80;
  const strokeWidth = 20;
  const normalizedRadius = radius - strokeWidth / 2;
  const circumference = normalizedRadius * Math.PI; // Half circle
  const strokeDasharray = `${circumference} ${circumference}`;
  const strokeDashoffset = circumference - (animatedConfidence / 100) * circumference;

  // Create segments for the arch using a simpler approach
  const segmentCount = 8;
  const segments = [];
  const angleStep = 180 / segmentCount;

  for (let i = 0; i < segmentCount; i++) {
    const startAngle = i * angleStep;
    const endAngle = (i + 1) * angleStep;
    const isActive = (animatedConfidence / 100) >= (i + 1) / segmentCount;
    
    // Convert angles to radians and calculate positions
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;
    
    const innerR = normalizedRadius - strokeWidth / 2;
    const outerR = normalizedRadius + strokeWidth / 2;
    
    const x1 = radius + innerR * Math.cos(Math.PI - startRad);
    const y1 = radius - innerR * Math.sin(Math.PI - startRad);
    const x2 = radius + outerR * Math.cos(Math.PI - startRad);
    const y2 = radius - outerR * Math.sin(Math.PI - startRad);
    
    const x3 = radius + outerR * Math.cos(Math.PI - endRad);
    const y3 = radius - outerR * Math.sin(Math.PI - endRad);
    const x4 = radius + innerR * Math.cos(Math.PI - endRad);
    const y4 = radius - innerR * Math.sin(Math.PI - endRad);
    
    const largeArc = angleStep > 180 ? 1 : 0;
    
    const pathData = [
      `M ${x1} ${y1}`,
      `L ${x2} ${y2}`,
      `A ${outerR} ${outerR} 0 ${largeArc} 1 ${x3} ${y3}`,
      `L ${x4} ${y4}`,
      `A ${innerR} ${innerR} 0 ${largeArc} 0 ${x1} ${y1}`,
      'Z'
    ].join(' ');

    segments.push({
      path: pathData,
      color: isActive ? colors.segments[i] : (darkMode ? '#374151' : '#f3f4f6'),
      isActive
    });
  }

  return (
    <div className="flex flex-col items-center space-y-4">
      <div className="relative">
        <svg width={radius * 2} height={radius + 20}>
          {segments.map((segment, i) => (
            <path
              key={i}
              d={segment.path}
              fill={segment.color}
              stroke={darkMode ? '#1f2937' : '#ffffff'}
              strokeWidth="1"
              className="transition-all duration-300"
            />
          ))}
        </svg>
        
        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center transform translate-y-2">
          <div className={`text-3xl font-bold ${
            judgment === 'YES' ? 'text-emerald-600 dark:text-emerald-400' :
            judgment === 'NO' ? 'text-red-600 dark:text-red-400' :
            'text-amber-600 dark:text-amber-400'
          }`}>
            {Math.round(animatedConfidence)}%
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-300 font-medium">
            Confidence
          </div>
        </div>
      </div>

      {/* Judgment label */}
      <div className={`px-6 py-2 rounded-full font-semibold text-lg ${
        judgment === 'YES' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' :
        judgment === 'NO' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
        'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
      }`}>
        {judgment}
      </div>
    </div>
  );
};

// ConfidenceDetailsPanel removed per request

const ConfidenceBar = ({ chartId, judgment, confidence, darkMode }) => {
  // Width-based animation for simplicity and reliability
  const [animatedConfidence, setAnimatedConfidence] = useState(0);
  const lastAnimatedChartIdRef = useRef(null);

  const clampedNumber = (n) => {
    const v = typeof n === 'number' && isFinite(n) ? n : 0;
    return Math.max(0, Math.min(Math.round(v), 100));
  };

  // Debug: log mount/unmount to detect remounts on tab changes
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log('ConfidenceBar Mount', chartId);
    return () => {
      // eslint-disable-next-line no-console
      console.log('ConfidenceBar Unmount', chartId);
    };
  }, []);

  // Animate when a new chart is loaded (chartId changes). This ensures
  // the bar does not re-animate when switching tabs for the same chart,
  // but will animate once when a new chart is cast/loaded.
  useEffect(() => {
    if (chartId == null) return;
    const hasNumber = typeof confidence === 'number' && isFinite(confidence);
    if (!hasNumber) return;

    const clamped = Math.max(0, Math.min(confidence, 100));

    if (lastAnimatedChartIdRef.current !== chartId) {
      // New chart: animate from 0 -> clamped
      setAnimatedConfidence(0);
      const timer = setTimeout(() => {
        setAnimatedConfidence(clamped);
        lastAnimatedChartIdRef.current = chartId;
      }, 50);
      return () => clearTimeout(timer);
    }

    // Same chart, confidence changed later: update without re-animating
    setAnimatedConfidence(clamped);
  }, [chartId, confidence]);

  const getJudgmentColor = (judgment) => {
    switch (judgment) {
      case 'YES': return 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400';
      case 'NO': return 'text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400';
      default: return 'text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400';
    }
  };

  // (removed: moved to reusable component ConfidenceDetailsPanel)

  const getProgressColor = (judgment) => {
    switch (judgment) {
      case 'YES': return 'bg-emerald-500';
      case 'NO': return 'bg-red-500'; 
      default: return 'bg-amber-500';
    }
  };

  // Thumb follows animated percentage
  const percent = Math.round(animatedConfidence);
  const thumbPosition = Math.min(Math.max(percent - 4, 4), 96); // Keep thumb visible

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
      {/* Verdict Badge */}
      <span className={`px-4 py-2 rounded-full text-sm font-medium ${getJudgmentColor(judgment)} shrink-0`}>
        {judgment}
      </span>
      
      {/* Confidence Label + Progress Bar */}
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-gray-600 dark:text-gray-300 font-medium shrink-0">
          Confidence
        </span>
        
        {/* Progress Bar Container */}
        <div className="relative w-60 h-6 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          {/* Fill Bar - width animates from 0% to target */}
          <div 
            className={`absolute left-0 top-0 h-6 ${getProgressColor(judgment)} rounded-full transition-all duration-1000 ease-out`}
            style={{ width: `${animatedConfidence}%` }}
          />
          
          {/* Circular Thumb - positioned absolutely */}
          <div 
            className="absolute top-1/2 transform -translate-y-1/2 transition-all duration-1000 ease-out z-10"
            style={{ left: `${thumbPosition}%`, transform: 'translate(-50%, -50%)' }}
          >
            <div className="w-10 h-10 bg-white rounded-full shadow-lg border-2 border-gray-300 dark:border-gray-500 flex items-center justify-center">
              <span className="text-xs font-bold text-gray-800 dark:text-gray-200">
                {clampedNumber(confidence)}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Enhanced Chart View Component  
const EnhancedChartView = ({ chart, darkMode, notes, setNotes, licenseActive, setCurrentView }) => {
  const [activeTab, setActiveTab] = useState('judgment');
  const [noteText, setNoteText] = useState(notes[chart.id] || '');
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [toast, setToast] = useState(null);

  // Simple toast system
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const cardBg = darkMode 
    ? 'bg-gray-800/60 backdrop-blur-xl border-gray-700' 
    : 'bg-white/60 backdrop-blur-xl border-white/80';

  const getJudgmentColor = (judgment) => {
    switch (judgment) {
      case 'YES': return 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400';
      case 'NO': return 'text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400';
      default: return 'text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400';
    }
  };

  const handleSaveNote = () => {
    setNotes(chart.id, noteText);
    setIsEditingNote(false);
  };


  const guardPremium = (action) => {
    if (!licenseActive) {
      showToast('Activate Vox Stella to unlock this feature', 'error');
      return false;
    }
    return true;
  };

  const handleExportChart = () => {
    if (!guardPremium()) return;
    const exportData = buildChartPayload(chart, true);
    exportData.chart_data = chart.chart_data;
    exportData.calculation_metadata = chart.calculation_metadata;
    exportData.notes = noteText;

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json'
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `enhanced-horary-chart-${chart.id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };


  const handleShareChart = async () => {
    if (!guardPremium()) return;
    try {
      const data = buildChartPayload(chart, true);

      const shareTitle = `Horary: ${data.question}`;
      const shareText = `${shareTitle}\n\nAsked: ${data.asked_at_local} · Where: ${data.location.city}, ${data.location.country} · Houses: ${data.house_system}\n\nVerdict: ${data.verdict.label} (${data.verdict.confidence}%)\n\nKey testimonies:\n${cleanMoonText(data.keyTestimoniesText)}`;

      if (navigator.share) {
        try {
          await navigator.share({
            title: shareTitle,
            text: shareText,
            url: window.location.href
          });

          showToast('Shared!');
          return;
        } catch (err) {
          if (err.name === 'AbortError') {
            return;
          }
        }
      }

      const fullShareText = `${shareText}\n\n--- Chart Data ---\n${JSON.stringify(data, null, 2)}`;
      await navigator.clipboard.writeText(fullShareText);
      showToast('Copied to clipboard — paste to share');

    } catch (error) {
      console.error('Share failed:', error);
      showToast(`Couldn't share: ${error.message}`, 'error');
    }
  };
  const handleAnalyzeWithAI = async () => {
    if (!guardPremium()) return;
    try {
      const data = buildChartPayload(chart, false, true); // Don't include verdict, forAI = true

      const prompt = `Role: You are a traditional horary astrologer using Lilly as baseline (Sahl/Bonatti comparisons welcome). Work strictly from the chart data provided; do not recast unless you detect a blatant inconsistency, in which case note it as a warning.

Task: Judge the question using traditional horary rules and produce a clear, auditable verdict.

Analysis Requirements:
1. Assign weights to each significant factor (e.g., "High weight", "Medium weight", "Low weight", or numerical 1-10)
2. Provide a confidence percentage (0-100%) for your final judgment
3. Show your reasoning step-by-step with factor weights clearly indicated
4. Give final verdict as: YES/NO with confidence percentage

Question: "${data.question}"

Asked: ${data.asked_at_local}
Location: ${data.location.city}, ${data.location.country}
Coordinates: ${data.location.lat}°, ${data.location.lon}°
Timezone: ${data.tz}

Expected Output Format:
## Astrological Analysis

### Key Factors (with weights):
- [Factor 1]: [Weight] - [Explanation]
- [Factor 2]: [Weight] - [Explanation]
- [etc.]

### Traditional Considerations:
- Radicality: [Assessment]
- Significators: [Analysis with weights]
- Perfection Analysis: [Details with weights]
- Moon Testimony: [Analysis with weights]

### Final Judgment:
**Verdict:** [YES/NO]
**Confidence:** [X]%
**Primary Reasoning:** [Key factors that determined the outcome]

Chart Data:
${JSON.stringify(data, null, 2)}`;

      // Copy prompt + data to clipboard
      await navigator.clipboard.writeText(prompt);
      showToast('AI analysis prompt copied to clipboard! Paste it into your preferred AI assistant (ChatGPT, Claude, etc.)');
      
    } catch (error) {
      console.error('AI analysis failed:', error);
      showToast(`Couldn't prepare AI analysis: ${error.message}`, 'error');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Enhanced Header */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold mb-2">{chart.question}</h2>
            <div className="flex items-center space-x-4 flex-wrap">
              {licenseActive ? (
                <ConfidenceBar 
                  chartId={chart.id}
                  judgment={chart.judgment}
                  confidence={chart.confidence}
                  darkMode={darkMode}
                />
              ) : (
                <div className="px-3 py-2 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-sm">
                  Activate to view verdict and confidence
                </div>
              )}
            </div>
            <div className="flex items-center space-x-4 flex-wrap mt-4">
              {/* NEW: Enhanced features indicators */}
              {chart.enhanced && (
                <span className="px-3 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 rounded-full text-xs flex items-center">
                  <Sparkles className="w-3 h-3 mr-1" />
                  Enhanced
                </span>
              )}
              {chart.solar_factors?.significant && (
                <span className="px-3 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded-full text-xs flex items-center">
                  <Sun className="w-3 h-3 mr-1" />
                  Solar Conditions
                </span>
              )}
              {chart.demo && (
                <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full text-xs">
                  Demo Chart
                </span>
              )}
            </div>
          </div>
          
          {/* Action Buttons */}
          <div className="flex items-center space-x-2">
            <div className="relative group">
              <button 
                onClick={handleShareChart}
                disabled={!licenseActive}
                className={`p-2 rounded-lg transition-colors ${licenseActive ? 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600' : 'bg-gray-200 dark:bg-gray-800 cursor-not-allowed opacity-60'}`}
                title="Share chart"
              >
                <Share2 className="w-5 h-5" />
              </button>
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                Share chart
              </div>
            </div>
            
            <div className="relative group">
              <button 
                onClick={handleAnalyzeWithAI}
                disabled={!licenseActive}
                className={`p-2 rounded-lg transition-colors ${licenseActive ? 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600' : 'bg-gray-200 dark:bg-gray-800 cursor-not-allowed opacity-60'}`}
                title="Analyze with AI"
              >
                <Brain className="w-5 h-5" />
              </button>
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                Analyze with AI
              </div>
            </div>
            
            <div className="relative group">
              <button 
                onClick={handleExportChart}
                disabled={!licenseActive}
                className={`p-2 rounded-lg transition-colors ${licenseActive ? 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600' : 'bg-gray-200 dark:bg-gray-800 cursor-not-allowed opacity-60'}`}
                title="Download JSON"
              >
                <Download className="w-5 h-5" />
              </button>
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                Download JSON
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg transition-all duration-300 ${
          toast.type === 'error' 
            ? 'bg-red-500 text-white' 
            : 'bg-emerald-500 text-white'
        }`}>
          {toast.message}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
        {/* Chart Wheel - Left Panel */}
        <div className="xl:col-span-2">
          <div className={`${cardBg} border rounded-2xl p-6 mb-6`}>
            <h3 className="text-lg font-semibold mb-4">Chart Wheel</h3>
            <EnhancedChartWheel chart={chart} darkMode={darkMode} />
          </div>

        </div>

        {/* Analysis Panels - Right Panel (masked when not activated) */}
        <div className="xl:col-span-2">
          <div className={`space-y-6`}>
          {/* Enhanced Tabs */}
          <div className={`${cardBg} border rounded-2xl p-6 relative`}>
            {/* Tabs header stays interactive even when locked */}
            <div className="flex flex-wrap gap-1 mb-6 relative z-10">
              <TabButton 
                active={activeTab === 'judgment'} 
                onClick={() => setActiveTab('judgment')}
                text="Judgment"
                darkMode={darkMode}
              />
              <TabButton 
                active={activeTab === 'dignities'} 
                onClick={() => setActiveTab('dignities')}
                text="Dignities"
                darkMode={darkMode}
              />
              <TabButton
                active={activeTab === 'aspects'}
                onClick={() => setActiveTab('aspects')}
                text="Aspects"
                darkMode={darkMode}
              />
              <TabButton
                active={activeTab === 'general'}
                onClick={() => setActiveTab('general')}
                text="General Info"
                darkMode={darkMode}
              />
              <TabButton
                active={activeTab === 'considerations'}
                onClick={() => setActiveTab('considerations')}
                text="Considerations"
                darkMode={darkMode}
              />
              <TabButton
                active={activeTab === 'moon-story'}
                onClick={() => setActiveTab('moon-story')}
                text="Moon Story"
                darkMode={darkMode}
              />
              <TabButton 
                active={activeTab === 'notes'} 
                onClick={() => setActiveTab('notes')}
                text="Notes"
                darkMode={darkMode}
              />
            </div>

            {/* Panels area wrapped to allow overlay without blocking tabs */}
            <div className="relative">
              {activeTab === 'judgment' && (
                <EnhancedJudgmentPanel chart={chart} darkMode={darkMode} />
              )}
              {activeTab === 'dignities' && (
                <DignityTablePanel chart={chart} darkMode={darkMode} />
              )}
              {activeTab === 'aspects' && (
                <AspectsTablePanel chart={chart} darkMode={darkMode} />
              )}
              {activeTab === 'general' && (
                <GeneralInfoPanel chart={chart} darkMode={darkMode} />
              )}
              {activeTab === 'considerations' && (
                <ConsiderationsPanel chart={chart} darkMode={darkMode} />
              )}
              {activeTab === 'moon-story' && (
                <MoonStoryPanel chart={chart} darkMode={darkMode} />
              )}
              {activeTab === 'notes' && (
                <NotesPanel 
                  noteText={noteText}
                  setNoteText={setNoteText}
                  isEditing={isEditingNote}
                  setIsEditing={setIsEditingNote}
                  onSave={handleSaveNote}
                  darkMode={darkMode}
                />
              )}
              {!licenseActive && (
                <div className="absolute inset-0 rounded-xl backdrop-blur-md bg-white/80 dark:bg-gray-900/80 border border-white/40 dark:border-gray-700/60 flex items-center justify-center">
                  <div className="text-center px-6 py-4">
                    <div className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">Activate to unlock full analysis</div>
                    <div className="text-sm text-gray-700 dark:text-gray-300 mb-4">Judgment details, reasoning, dignities, aspects, and more are available after activation.</div>
                    <button onClick={() => setCurrentView && setCurrentView('settings')} className="px-4 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700">Activate</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Enhanced Solar Conditions */}
          {chart.chart_data?.solar_conditions_summary && (
            <div className={`${cardBg} border rounded-2xl p-6`}>
              <h3 className="text-lg font-semibold mb-4 flex items-center">
                <Sun className="w-5 h-5 mr-2 text-yellow-500" />
                Solar Conditions
              </h3>
              <EnhancedSolarConditionsPanel 
                solarData={chart.chart_data.solar_conditions_summary} 
                solarFactors={chart.solar_factors}
                darkMode={darkMode} 
              />
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
};

// NEW: Enhanced Tab Button with enhanced indicator
function TabButton({ active, onClick, text, darkMode, enhanced = false }) {
  const activeClasses = active 
    ? 'bg-indigo-600 text-white' 
    : darkMode 
      ? 'text-gray-300 hover:text-white hover:bg-gray-700' 
      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100';

  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${activeClasses} ${enhanced ? 'relative' : ''}`}
    >
      {text}
      {enhanced && (
        <Sparkles className="absolute -top-1 -right-1 w-3 h-3 text-indigo-400" />
      )}
    </button>
  );
}

// NEW: Sub-Tab Navigation Component
function SubTabNavigation({ activeSubTab, setActiveSubTab, darkMode }) {
  const tabs = [
    { id: 'reasoning', label: 'Reasoning', icon: Brain },
    { id: 'factors', label: 'Factors', icon: Book },
    { id: 'technical', label: 'Technical', icon: Info }
  ];

  return (
    <div className="flex space-x-1 p-1 bg-gray-100 dark:bg-gray-800/50 rounded-lg">
      {tabs.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => setActiveSubTab(id)}
          className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
            activeSubTab === id
              ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-white/50 dark:hover:bg-gray-700/50'
          }`}
        >
          <Icon className="w-4 h-4" />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}

// NEW: Enhanced text rendering for reasoning content
const renderEnhancedReasoningText = (text, darkMode) => {
  if (!text || typeof text !== 'string') return text;

  const planetColors = {
    'Sun': 'text-yellow-500 dark:text-yellow-400',
    'Moon': 'text-gray-400 dark:text-gray-300', 
    'Mercury': 'text-orange-500 dark:text-orange-400',
    'Venus': 'text-green-500 dark:text-green-400',
    'Mars': 'text-red-500 dark:text-red-400',
    'Jupiter': 'text-blue-500 dark:text-blue-400',
    'Saturn': 'text-indigo-600 dark:text-indigo-400'
  };

  const aspectSymbols = {
    'Conjunction': '☌', 'Sextile': '⚹', 'Square': '□', 'Trine': '△', 'Opposition': '☍',
    'conjunction': '☌', 'sextile': '⚹', 'square': '□', 'trine': '△', 'opposition': '☍'
  };

  const aspectColors = {
    'Conjunction': 'text-red-600 dark:text-red-400',
    'Sextile': 'text-green-600 dark:text-green-400', 
    'Square': 'text-red-600 dark:text-red-400',
    'Trine': 'text-blue-600 dark:text-blue-400',
    'Opposition': 'text-purple-600 dark:text-purple-400',
    'conjunction': 'text-red-600 dark:text-red-400',
    'sextile': 'text-green-600 dark:text-green-400', 
    'square': 'text-red-600 dark:text-red-400',
    'trine': 'text-blue-600 dark:text-blue-400',
    'opposition': 'text-purple-600 dark:text-purple-400'
  };

  // Split text into words while preserving whitespace and punctuation
  const parts = text.split(/(\s+|[.,;:()!?])/);
  
  return parts.map((part, index) => {
    const cleanPart = part.replace(/[^\w]/g, ''); // Remove punctuation for matching
    
    // Check for planet names
    if (PLANET_SYMBOLS[cleanPart]) {
      const symbol = PLANET_SYMBOLS[cleanPart];
      const color = planetColors[cleanPart];
      return (
        <span key={index} className={`font-medium ${color}`} title={cleanPart}>
          {part.replace(cleanPart, symbol)}
        </span>
      );
    }
    
    // Check for aspect names
    if (aspectSymbols[cleanPart]) {
      const symbol = aspectSymbols[cleanPart];
      const color = aspectColors[cleanPart];
      return (
        <span key={index} className={`font-medium ${color}`} title={cleanPart}>
          {part.replace(cleanPart, symbol)}
        </span>
      );
    }
    
    // Check for applying/separating
    if (cleanPart.toLowerCase() === 'applying') {
      return (
        <span key={index}>
          {part.replace(/applying/i, '')}
          <span className="inline-flex items-center px-2 py-1 mx-1 text-xs rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
            Applying
          </span>
        </span>
      );
    }
    
    if (cleanPart.toLowerCase() === 'separating') {
      return (
        <span key={index}>
          {part.replace(/separating/i, '')}
          <span className="inline-flex items-center px-2 py-1 mx-1 text-xs rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
            Separating
          </span>
        </span>
      );
    }
    
    // Return the part as-is if no match
    return <span key={index}>{part}</span>;
  });
};

// NEW: Reasoning Timeline Panel
const ReasoningTimelinePanel = ({ reasoning, chart, darkMode }) => {
  const [expandedNodes, setExpandedNodes] = useState(new Set());
  
  const toggleNode = (index) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedNodes(newExpanded);
  };

  // Process reasoning into timeline nodes
  const timelineNodes = useMemo(() => {
    const nodes = [];

    // Process reasoning entries if available
    if (reasoning && Array.isArray(reasoning)) {
      reasoning.forEach((entry, index) => {
        if (typeof entry === 'string') {
          const { rule, weight } = parseReasoningEntry(entry);
          nodes.push({
            type: 'analysis',
            title: rule.length > 50 ? rule.substring(0, 50) + '...' : rule,
            content: rule,
            weight,
            stage: 'Analysis',
            originalIndex: index
          });
        } else if (entry && typeof entry === 'object') {
          nodes.push({
            type: 'analysis',
            title: (entry.rule || '').length > 50 ? (entry.rule || '').substring(0, 50) + '...' : (entry.rule || ''),
            content: entry.rule || '',
            weight: entry.weight || 0,
            stage: entry.stage || 'Analysis',
            originalIndex: index
          });
        }
      });
    }

    // Always include decision node so ArchGauge renders
    nodes.push({
      type: 'decision',
      title: 'Final Judgment',
      content: 'All factors weighed for final verdict',
      weight: 0,
      stage: 'Decision'
    });

    return nodes;
  }, [reasoning]);

  const getNodeColor = (weight, type) => {
    if (type === 'start') return 'bg-blue-500 border-blue-600';
    if (type === 'decision') return 'bg-purple-500 border-purple-600';
    
    if (weight > 0) return 'bg-emerald-500 border-emerald-600';
    if (weight < 0) return 'bg-red-500 border-red-600';
    return 'bg-gray-400 border-gray-500';
  };

  const getWeightDisplay = (weight) => {
    if (weight === 0) return '';
    return weight > 0 ? `+${weight}` : `${weight}`;
  };

  return (
    <div className="space-y-4">
      <div className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Follow the reasoning timeline from chart casting to final judgment. Click nodes to expand details.
      </div>
      
      <div className="space-y-4">
        {timelineNodes.map((node, index) => (
          <div key={index} className="relative">
            {/* Centered Dot */}
            <div className="absolute left-4 top-1/2 transform -translate-y-1/2 z-10">
              <div className={`w-3 h-3 rounded-full ${
                node.type === 'decision' ? 'bg-purple-500' :
                node.weight > 0 ? 'bg-emerald-500' :
                node.weight < 0 ? 'bg-red-500' :
                'bg-gray-400'
              } shadow-sm`}></div>
            </div>
            
            {/* Node Content */}
            <div className="pl-10">
              <button
                onClick={() => node.type === 'analysis' && toggleNode(index)}
                className={`w-full text-left p-4 rounded-lg border ${
                  darkMode ? 'bg-gray-800/50 border-gray-600' : 'bg-white border-gray-200'
                } shadow-sm ${
                  node.type === 'analysis' ? 'hover:bg-gray-50 dark:hover:bg-gray-800/70 cursor-pointer' : 
                  node.type === 'decision' ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-700 cursor-default' :
                  'cursor-default'
                } transition-colors duration-200`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h5 className="font-medium text-gray-800 dark:text-gray-200 mb-1">
                      {node.type === 'analysis' ? renderEnhancedReasoningText(node.title, darkMode) : node.title}
                    </h5>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                      {node.stage}
                    </div>
                  </div>
                  
                  {node.type === 'analysis' && (
                    <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${
                      expandedNodes.has(index) ? 'rotate-90' : ''
                    }`} />
                  )}
                </div>
              </button>
              
              
              {/* Expanded Content */}
              {(node.type !== 'analysis' || expandedNodes.has(index) || node.type === 'decision') && (
                <div className="px-4 pb-4">
                  {/* Special rendering for Final Judgment decision node */}
                  {node.type === 'decision' ? (
                    <ArchGauge 
                      judgment={chart?.judgment}
                      confidence={chart?.confidence}
                      darkMode={darkMode}
                    />
                  ) : (
                    <div className="text-sm text-gray-600 dark:text-gray-300 mt-2">
                      {node.type === 'analysis' ? renderEnhancedReasoningText(node.content, darkMode) : node.content}
                    </div>
                  )}
                  
                  {/* Weight Bar for analysis nodes */}
                  {node.type === 'analysis' && node.weight !== 0 && (
                    <div className="mt-3">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs text-gray-500 dark:text-gray-400">Impact:</span>
                        <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-500 ${
                              node.weight > 0 ? 'bg-emerald-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${Math.min(Math.abs(node.weight) * 4, 100)}%` }}
                          ></div>
                        </div>
                        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                          {getWeightDisplay(node.weight)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// NEW: Factors Panel
const FactorsPanel = ({ chart, darkMode }) => {
  // Derive houses directly from backend classification
  const getExaminedHouses = () => {
    const houseDescriptions = {
      1: "Querent (Person asking)",
      2: "Money & possessions",
      3: "Short journeys",
      4: "Home & family",
      5: "Children & creativity",
      6: "Health & illness",
      7: "Others & open enemies",
      8: "Death & debts",
      9: "Long journeys & religion",
      10: "Career & reputation",
      11: "Friends & hopes",
      12: "Secrets & sorrows",
    };

    const houses =
      chart?.question_analysis?.relevant_houses && chart.question_analysis.relevant_houses.length
        ? Array.from(new Set(chart.question_analysis.relevant_houses))
        : [1];

    return houses
      .sort((a, b) => a - b)
      .map((num) => ({
        number: num,
        description: houseDescriptions[num] || `House ${num}`,
      }));
  };

  const examinedHouses = getExaminedHouses();

  return (
    <div className="space-y-6">
      {/* Houses Examined */}
      <div className={`p-4 rounded-lg border ${
        darkMode ? 'bg-gray-800/30 border-gray-600' : 'bg-gray-50/50 border-gray-200'
      }`}>
        <h4 className="font-semibold mb-3 text-indigo-600 dark:text-indigo-400">
          Houses Examined
        </h4>
        <div className="space-y-3 text-sm">
          {examinedHouses.map((house, index) => (
            <div key={index} className="flex items-center space-x-3">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-900/30 shadow-sm">
                  {house.number}
                </div>
              </div>
              <div className="flex-1 px-3 py-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/50">
                <span className="font-medium text-indigo-800 dark:text-indigo-200">{house.description}</span>
              </div>
            </div>
          ))}
        </div>
        {chart.traditional_factors?.querent_ruler && (
          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
            <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
              <div>Querent ruler: {chart.traditional_factors.querent_ruler}</div>
              {chart.traditional_factors.quesited_ruler && (
                <div>Quesited ruler: {chart.traditional_factors.quesited_ruler}</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Traditional Factors */}
      {chart.traditional_factors && (
        <div className={`p-4 rounded-lg border ${
          darkMode ? 'bg-gray-800/30 border-gray-600' : 'bg-gray-50/50 border-gray-200'
        }`}>
          <h4 className="font-semibold mb-3 flex items-center text-green-600 dark:text-green-400">
            <Book className="w-5 h-5 mr-2" />
            Traditional Factors
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            {chart.traditional_factors.perfection_type && (
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Perfection:</span>
                <span className="font-medium">{chart.traditional_factors.perfection_type}</span>
              </div>
            )}
            {(() => {
              const r = chart.traditional_factors?.reception;
              const asNiceText = (s) => String(s).replace(/_/g, ' ');
              const display =
                typeof r === 'string'
                  ? (r.toLowerCase() === 'none' ? null : asNiceText(r))
                  : (r?.display_text || (r?.type ? asNiceText(r.type) : null));

              return display ? (
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Reception:</span>
                  <span className="font-medium">{display}</span>
                </div>
              ) : null;
            })()}
            {chart.traditional_factors.querent_strength !== undefined && (
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Querent Strength:</span>
                <span className="font-medium">{chart.traditional_factors.querent_strength}</span>
              </div>
            )}
            {chart.traditional_factors.quesited_strength !== undefined && (
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Quesited Strength:</span>
                <span className="font-medium">{chart.traditional_factors.quesited_strength}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Timing Analysis */}
      {chart.timing && (
        <div className={`p-4 rounded-lg border ${
          darkMode ? 'bg-gray-800/30 border-gray-600' : 'bg-gray-50/50 border-gray-200'
        }`}>
          <h4 className="font-semibold mb-3 flex items-center text-purple-600 dark:text-purple-400">
            <Clock className="w-5 h-5 mr-2" />
            Timing Analysis
          </h4>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">{chart.timing}</p>
          {chart.traditional_factors?.perfection_type && (
            <p className="text-xs text-purple-600 dark:text-purple-400">
              Perfection Type: {chart.traditional_factors.perfection_type}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

// NEW: Technical Details Panel
const TechnicalDetailsPanel = ({ chart, darkMode }) => {
  return (
    <div className="space-y-6">
      <div className={`p-4 rounded-lg border ${
        darkMode ? 'bg-gray-800/30 border-gray-600' : 'bg-gray-50/50 border-gray-200'
      }`}>
        <h4 className="font-semibold mb-3 flex items-center text-blue-600 dark:text-blue-400">
          <Info className="w-5 h-5 mr-2" />
          Chart Details
        </h4>
        <div className="space-y-3 text-sm">
          {chart.chart_data?.ascendant !== undefined && (
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Ascendant:</span>
              <span className="font-medium">
                {`${(chart.chart_data.ascendant % 30).toFixed(1)}° ${getSignFromDegree(chart.chart_data.ascendant)}`}
              </span>
            </div>
          )}
          
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">House System:</span>
            <span className="font-medium">Regiomontanus (Traditional)</span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-gray-600 dark:text-gray-400">Engine:</span>
            <div className="flex items-center space-x-2">
              <span className="font-medium">
                {chart.calculation_metadata?.engine_version || 'Enhanced Traditional Horary'}
              </span>
              {chart.enhanced && (
                <span className="px-2 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 rounded text-xs">
                  v2.0
                </span>
              )}
            </div>
          </div>

          {chart.demo && (
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">Chart Type:</span>
              <div className="flex items-center space-x-2">
                <span className="font-medium">Demo Chart</span>
                <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded text-xs">
                  Enhanced Features Simulated
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


// NEW: Enhanced Judgment Panel with Sub-Tabs
const EnhancedJudgmentPanel = ({ chart, darkMode }) => {
  const [activeSubTab, setActiveSubTab] = useState('reasoning');
  const overrideFlags = chart.calculation_metadata?.override_flags_applied || {};
  const hasOverrides = Object.values(overrideFlags).some(flag => flag === true);

  return (
    <div className="space-y-4">
      {/* Override Warning Banner */}
      {hasOverrides && (
        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
          <div className="flex items-start space-x-2">
            <Shield className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
            <div>
              <div className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-1">
                Traditional Restrictions Overridden
              </div>
              <div className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
                {overrideFlags.ignore_radicality && (
                  <div>• Radicality check bypassed - judgment proceeded despite traditional concerns</div>
                )}
                {overrideFlags.ignore_void_moon && (
                  <div>• Void Moon restriction bypassed - judgment given despite Moon's condition</div>
                )}
                {overrideFlags.ignore_combustion && (
                  <div>• Solar combustion effects ignored - planets treated as free from solar interference</div>
                )}
                {overrideFlags.ignore_saturn_7th && (
                  <div>• Saturn in 7th house warning bypassed - Bonatti's astrologer error warning ignored</div>
                )}
                <div className="mt-2 text-blue-600 dark:text-blue-400">
                  ⚠️ Use override results with expert judgment and traditional knowledge
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sub-Tab Navigation */}
      <SubTabNavigation 
        activeSubTab={activeSubTab} 
        setActiveSubTab={setActiveSubTab} 
        darkMode={darkMode} 
      />

      {/* Tab Content */}
      {activeSubTab === 'reasoning' && (
        <>
          {/* Use the redesigned flat table and then show the confidence arch */}
          <JudgmentBreakdown reasoning={chart.reasoning} darkMode={darkMode} />
          <div className="mt-6 p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">Final Judgment</div>
            <ArchGauge judgment={chart?.judgment} confidence={chart?.confidence} darkMode={darkMode} />
          </div>
        </>
      )}
      {activeSubTab === 'factors' && (
        <FactorsPanel chart={chart} darkMode={darkMode} />
      )}
      {activeSubTab === 'technical' && (
        <TechnicalDetailsPanel chart={chart} darkMode={darkMode} />
      )}
    </div>
  );
};

// NEW: Enhanced Considerations Panel with better radicality explanation
const ConsiderationsPanel = ({ chart, darkMode }) => {
  const c = chart.considerations || {};
  
  // Check if radicality was overridden in judgment
  const radicalityOverridden = chart.calculation_metadata?.override_flags_applied?.ignore_radicality;
  
  // Get detailed radicality reasons
  const getRadicalityDetails = (reason) => {
    if (reason.includes('too early')) {
      return {
        issue: 'Ascendant too early',
        explanation: 'Ascendant under 3° suggests the question is premature or not yet mature enough for judgment.',
        traditional_advice: 'Wait for the matter to develop further before asking again.'
      };
    }
    if (reason.includes('too late')) {
      return {
        issue: 'Ascendant too late',
        explanation: 'Ascendant over 27° suggests the question is too late or the matter is already decided.',
        traditional_advice: 'The opportunity may have passed, or the outcome is already determined.'
      };
    }
    if (reason.includes('Saturn in 7th')) {
      return {
        issue: 'Saturn in 7th house',
        explanation: 'Bonatti warns that Saturn in the 7th house indicates the astrologer may err in judgment.',
        traditional_advice: 'Proceed with extra caution and consider seeking a second opinion.'
      };
    }
    if (reason.includes('Via Combusta')) {
      return {
        issue: 'Moon in Via Combusta',
        explanation: 'Moon in the "Burned Way" (15° Libra to 15° Scorpio) indicates volatile or corrupted matter.',
        traditional_advice: 'The situation may be too chaotic or corrupted for clear judgment.'
      };
    }
    return null;
  };

  const radicalityDetails = c.radical_reason ? getRadicalityDetails(c.radical_reason) : null;

  return (
    <div className="space-y-4 text-sm">
      
      {/* Enhanced Radicality Section */}
      <div className={`p-4 rounded-lg border ${
        c.radical 
          ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-700' 
          : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700'
      }`}>
        <div className="flex items-start space-x-3">
          <div className="flex-shrink-0">
            {c.radical ? (
              <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            )}
          </div>
          
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium">
                {c.radical ? 'Chart is Radical' : 'Chart May Not Be Radical'}
              </h4>
              
              {/* Override indicator */}
              {radicalityOverridden && (
                <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded text-xs">
                  Override Applied
                </span>
              )}
            </div>
            
            <p className="text-gray-700 dark:text-gray-300 mb-3">
              {c.radical_reason}
            </p>
            
            {/* Enhanced explanation for non-radical charts */}
            {!c.radical && radicalityDetails && (
              <div className="space-y-2">
                <div className="text-xs text-amber-700 dark:text-amber-300">
                  <strong>Issue:</strong> {radicalityDetails.issue}
                </div>
                <div className="text-xs text-amber-700 dark:text-amber-300">
                  <strong>Explanation:</strong> {radicalityDetails.explanation}
                </div>
                <div className="text-xs text-amber-700 dark:text-amber-300">
                  <strong>Traditional Advice:</strong> {radicalityDetails.traditional_advice}
                </div>
              </div>
            )}
            
            {/* Override explanation */}
            {radicalityOverridden && !c.radical && (
              <div className="mt-3 p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded">
                <div className="text-xs text-blue-700 dark:text-blue-300">
                  <strong>Note:</strong> Warning overrides were applied to remove cautionary messages 
                  and restore full confidence. The underlying astrological conditions still apply, 
                  but their limiting effects on confidence have been bypassed.
                </div>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Moon Void of Course Section */}
      <div className={`p-4 rounded-lg border ${
        c.moon_void 
          ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700' 
          : 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-700'
      }`}>
        <div className="flex items-start space-x-3">
          <div className="flex-shrink-0">
            {c.moon_void ? (
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            ) : (
              <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            )}
          </div>
          
          <div className="flex-1">
            <h4 className="font-medium mb-2">
              {c.moon_void ? 'Moon Void of Course' : 'Moon Not Void of Course'}
            </h4>
            
            <p className="text-gray-700 dark:text-gray-300 mb-2">
              {c.moon_void_reason}
            </p>
            
            {c.moon_void && (
              <div className="text-xs text-amber-700 dark:text-amber-300">
                <strong>Traditional Meaning:</strong> When the Moon is void of course, 
                it typically indicates that "nothing will come of the matter" or that 
                new undertakings will not proceed as planned.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Traditional Context */}
      <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
        <div className="font-medium mb-2">Traditional Horary Considerations:</div>
        <div>• <strong>Radicality:</strong> A chart must be "radical" (valid) to give reliable judgment</div>
        <div>• <strong>Void Moon:</strong> Traditionally prevents reliable outcomes for new matters</div>
        <div>• <strong>Modern Practice:</strong> Some astrologers override these restrictions with experience</div>
        <div>• <strong>Enhanced Engine:</strong> Provides both traditional assessment and modern flexibility</div>
      </div>
    </div>
  );
};

// NEW: Moon Story Panel
const MoonStoryPanel = ({ chart, darkMode }) => {
  const moonData = chart.chart_data?.planets?.Moon;
  const aspects = chart.chart_data?.aspects || [];
  const allPlanets = chart.chart_data?.planets || {};

  // Get current aspects involving the Moon
  const currentMoonAspects = aspects.filter(aspect => 
    aspect.planet1 === 'Moon' || aspect.planet2 === 'Moon'
  );

  // Get Moon void of course status from backend (same as other tabs)
  const getMoonVoidStatus = () => {
    if (!moonData) return { isVoid: false, reason: "Moon data not available" };

    const moonLongitude = moonData.longitude || 0;
    const currentSign = Math.floor(moonLongitude / 30);
    const nextSignBoundary = (currentSign + 1) * 30;
    const degreesToNextSign = nextSignBoundary - moonLongitude;

    // Use the authoritative void of course status from backend (same as other tabs)
    const moonCondition = chart.general_info?.moon_condition;
    const applyingAspects = currentMoonAspects.filter(
      aspect => aspect.applying === true
    );
    
    if (!moonCondition) {
      // Fallback to old logic if backend data not available
      return {
        isVoid: applyingAspects.length === 0,
        reason: applyingAspects.length === 0 
          ? `No applying aspects before leaving ${moonData.sign}` 
          : `${applyingAspects.length} applying aspect(s) before leaving ${moonData.sign}`,
        degreesToNextSign: degreesToNextSign.toFixed(2),
        timeToNextSign: moonData.speed ? `~${(degreesToNextSign / moonData.speed).toFixed(1)} days` : "Unknown"
      };
    }

    // Use backend's authoritative void of course calculation (considers sign boundaries)
    return {
      isVoid: moonCondition.void_of_course,
      reason: moonCondition.void_of_course 
        ? moonCondition.void_reason 
        : `${applyingAspects.length} applying aspect(s) before leaving ${moonData.sign}`,
      degreesToNextSign: degreesToNextSign.toFixed(2),
      timeToNextSign: moonData.speed ? `~${(degreesToNextSign / moonData.speed).toFixed(1)} days` : "Unknown"
    };
  };

  // Generate future aspects (simplified simulation)
  const getFutureAspects = () => {
    if (!moonData || !moonData.speed) return [];

    const futureAspects = [];
    const moonSpeed = moonData.speed; // degrees per day
    const currentLongitude = moonData.longitude || 0;

    // Check aspects Moon will make in next 30 days
    Object.entries(allPlanets).forEach(([planetName, planetData]) => {
      if (planetName === 'Moon') return;

      const planetLongitude = planetData.longitude || 0;
      const aspectOrbs = [0, 60, 90, 120, 180]; // Conjunction, Sextile, Square, Trine, Opposition
      const aspectNames = ['Conjunction', 'Sextile', 'Square', 'Trine', 'Opposition'];

      aspectOrbs.forEach((aspectDegree, index) => {
        // Calculate when Moon will reach this aspect to the planet
        let targetLongitude = planetLongitude + aspectDegree;
        if (targetLongitude >= 360) targetLongitude -= 360;

        let distanceToAspect = targetLongitude - currentLongitude;
        if (distanceToAspect < 0) distanceToAspect += 360;

        const daysToAspect = distanceToAspect / moonSpeed;

        // Only include aspects within next 30 days
        if (daysToAspect > 0 && daysToAspect <= 30) {
          futureAspects.push({
            planet: planetName,
            aspect: aspectNames[index],
            daysFromNow: daysToAspect.toFixed(1),
            exactDate: new Date(Date.now() + daysToAspect * 24 * 60 * 60 * 1000).toLocaleDateString(),
            orb: 0 // Will be exact when it perfects
          });
        }
      });
    });

    return futureAspects.sort((a, b) => parseFloat(a.daysFromNow) - parseFloat(b.daysFromNow)).slice(0, 10);
  };

  const voidStatus = getMoonVoidStatus();
  const futureAspects = getFutureAspects();

  const getAspectColor = (aspectName) => {
    switch (aspectName) {
      case 'Conjunction': return 'text-yellow-600 dark:text-yellow-400';
      case 'Sextile': return 'text-emerald-600 dark:text-emerald-400';
      case 'Square': return 'text-red-600 dark:text-red-400';
      case 'Trine': return 'text-blue-600 dark:text-blue-400';
      case 'Opposition': return 'text-purple-600 dark:text-purple-400';
      default: return 'text-gray-600 dark:text-gray-400';
    }
  };

  const getAspectSymbol = (aspectName) => {
    switch (aspectName) {
      case 'Conjunction': return '☌';
      case 'Sextile': return '⚹';
      case 'Square': return '□';
      case 'Trine': return '△';
      case 'Opposition': return '☍';
      default: return '○';
    }
  };

  // Helper function to determine if an aspect is supportive/favorable
  const isAspectSupportive = (aspectName) => {
    // Traditional favorable aspects
    return ['Conjunction', 'Sextile', 'Trine'].includes(aspectName);
  };

  if (!moonData) {
    return (
      <div className="text-center py-6 text-gray-500 dark:text-gray-400">
        <Moon className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>Moon data not available for this chart</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Moon Current Status */}
      <div>
        <h4 className="font-semibold mb-3 flex items-center">
          <Moon className="w-4 h-4 mr-2 text-blue-500" />
          Moon's Current Position
        </h4>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span>Position:</span>
            <span className="font-medium">
              {(moonData.longitude % 30).toFixed(1)}° {moonData.sign}
            </span>
          </div>
          <div className="flex justify-between">
            <span>House:</span>
            <span className="font-medium">{moonData.house}</span>
          </div>
          <div className="flex justify-between">
            <span>Daily Motion:</span>
            <span className="font-medium">
              {moonData.speed ? `${moonData.speed.toFixed(2)}°/day` : 'Unknown'}
              {moonData.speed && moonData.speed > 13 ? ' (Fast)' : moonData.speed && moonData.speed < 11 ? ' (Slow)' : ' (Average)'}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Dignity Score:</span>
            <span className={`font-medium ${
              moonData.dignity_score > 0 ? 'text-emerald-600 dark:text-emerald-400' : 
              moonData.dignity_score < 0 ? 'text-red-600 dark:text-red-400' : 
              'text-gray-600 dark:text-gray-400'
            }`}>
              {moonData.dignity_score > 0 ? '+' : ''}{moonData.dignity_score}
            </span>
          </div>
        </div>
      </div>

      {/* Void of Course Status */}
      <div>
        <h4 className="font-semibold mb-3 flex items-center">
          <AlertCircle className="w-4 h-4 mr-2 text-amber-500" />
          Void of Course Status
        </h4>
        <div className={`p-3 rounded-lg border ${
          voidStatus.isVoid 
            ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800' 
            : 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
        }`}>
          <div className={`flex items-center mb-2 ${
            voidStatus.isVoid 
              ? 'text-amber-700 dark:text-amber-300' 
              : 'text-emerald-700 dark:text-emerald-300'
          }`}>
            {voidStatus.isVoid ? (
              <>
                <AlertCircle className="w-4 h-4 mr-2" />
                <span className="font-medium">Moon is Void of Course</span>
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4 mr-2" />
                <span className="font-medium">Moon is NOT Void of Course</span>
              </>
            )}
          </div>
          <p className="text-xs mb-2">{voidStatus.reason}</p>
          <div className="text-xs space-y-1">
            <div>Degrees to next sign: {voidStatus.degreesToNextSign}°</div>
            <div>Time to next sign: {voidStatus.timeToNextSign}</div>
          </div>
          {voidStatus.isVoid && (
            <div className="mt-2 text-xs text-amber-600 dark:text-amber-400">
              ⚠️ Traditional advice: Avoid new undertakings during void Moon periods
            </div>
          )}
        </div>
      </div>

      {/* Current Moon Aspects */}
      <div>
        <h4 className="font-semibold mb-3 flex items-center">
          <Zap className="w-4 h-4 mr-2 text-purple-500" />
          Current Moon Aspects
        </h4>
        {currentMoonAspects.length > 0 ? (
          <div className="space-y-2">
            {currentMoonAspects.map((aspect, index) => {
              const otherPlanet = aspect.planet1 === 'Moon' ? aspect.planet2 : aspect.planet1;
              // Clean up planet name to avoid duplication (e.g., "Moon Venus" instead of "Moon Moon Venus")
              const cleanOtherPlanet = otherPlanet === 'Moon' ? 'Moon' : otherPlanet;
              const aspectColor = getAspectColor(aspect.aspect);
              const aspectSymbol = getAspectSymbol(aspect.aspect);
              const isApplying = aspect.applying === true;
              
              const showCrossSign = (aspect.perfection_within_sign === false && (aspect.time_to_perfection ?? 0) > 0);
              return (
                <div key={index} className="flex items-center justify-between p-2 rounded bg-gray-50 dark:bg-gray-800/50">
                  <div className="flex items-center space-x-2">
                    <span className={`text-lg ${aspectColor}`}>{aspectSymbol}</span>
                    <span className="font-medium">Moon {cleanOtherPlanet}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-xs">{aspect.orb?.toFixed(1)}° orb</div>
                    <div className={`text-xs px-2 py-1 rounded ${
                      isApplying
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                    }`}>
                      {isApplying ? 'Applying' : 'Separating'}
                    </div>
                    {showCrossSign && (
                      <div className="mt-1">
                        <span className="inline-block px-2 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                          Cross‑sign
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400 italic">
            No major aspects involving the Moon found
          </p>
        )}
      </div>

      {/* Future Moon Aspects */}
      <div>
        <h4 className="font-semibold mb-3 flex items-center">
          <TrendingUp className="w-4 h-4 mr-2 text-indigo-500" />
          Future Moon Aspects (Next 30 days)
        </h4>
        {futureAspects.length > 0 ? (
          <div className="space-y-2">
            {futureAspects.map((aspect, index) => {
              const aspectColor = getAspectColor(aspect.aspect);
              const aspectSymbol = getAspectSymbol(aspect.aspect);
              // Clean up planet name to avoid duplication
              const cleanPlanet = aspect.planet === 'Moon' ? 'Moon' : aspect.planet;
              
              return (
                <div key={index} className="flex items-center justify-between p-2 rounded bg-gray-50 dark:bg-gray-800/50">
                  <div className="flex items-center space-x-2">
                    <span className={`text-lg ${aspectColor}`}>{aspectSymbol}</span>
                    <span className="font-medium">Moon {cleanPlanet}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-medium">{aspect.exactDate}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      in {aspect.daysFromNow} days
                    </div>
                    <div className={`text-xs px-2 py-1 rounded mt-1 ${
                      isAspectSupportive(aspect.aspect)
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                        : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                    }`}>
                      {isAspectSupportive(aspect.aspect) ? 'Supportive' : 'Challenging'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400 italic">
            No major future aspects calculated for the next 30 days
          </p>
        )}
      </div>

    </div>
  );
};

// NEW: General Info Panel
const GeneralInfoPanel = ({ chart, darkMode }) => {
  const info = chart.general_info || deriveGeneralInfo(chart);
  const moon = info.moon_condition || {};

  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-3 rounded-lg border bg-gray-50 dark:bg-gray-800/50">
          <div className="font-medium">Planetary Day</div>
          <div>{info.planetary_day || 'N/A'}</div>
        </div>
        <div className="p-3 rounded-lg border bg-gray-50 dark:bg-gray-800/50">
          <div className="font-medium">Planetary Hour</div>
          <div>{info.planetary_hour || 'N/A'}</div>
        </div>
        <div className="p-3 rounded-lg border bg-gray-50 dark:bg-gray-800/50">
          <div className="font-medium">Moon Phase</div>
          <div>{info.moon_phase || 'N/A'}</div>
        </div>
        <div className="p-3 rounded-lg border bg-gray-50 dark:bg-gray-800/50">
          <div className="font-medium">Moon Mansion</div>
          <div>
            {info.moon_mansion ? `${info.moon_mansion.number} - ${info.moon_mansion.name}` : 'N/A'}
          </div>
        </div>
      </div>

      <div className="p-3 rounded-lg border bg-gray-50 dark:bg-gray-800/50">
        <div className="font-medium mb-1">Moon Condition</div>
        <div>Sign: {moon.sign || 'N/A'}</div>
        {moon.speed !== undefined && (
          <div>Speed: {moon.speed.toFixed(2)}°/day ({moon.speed_category})</div>
        )}
        <div className="flex items-center space-x-2 mt-1">
          {moon.void_of_course ? (
            <AlertCircle className="w-4 h-4 text-amber-500" />
          ) : (
            <CheckCircle className="w-4 h-4 text-emerald-500" />
          )}
          <span>{moon.void_of_course ? moon.void_reason : 'Not void of course'}</span>
        </div>
      </div>
    </div>
  );
};

// NEW: Enhanced Solar Conditions Panel
const EnhancedSolarConditionsPanel = ({ solarData, solarFactors, darkMode }) => {
  return (
    <div className="space-y-4">

      {/* Cazimi Planets */}
      {solarData.cazimi_planets?.length > 0 && (
        <div>
          <h5 className="text-sm font-semibold text-yellow-600 dark:text-yellow-400 mb-3">
            Cazimi (Heart of Sun) - Ultimate Dignity
          </h5>
          {solarData.cazimi_planets.map((planet, index) => (
            <div key={index} className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 mb-2">
              <div className="flex items-center justify-between">
                <span className="font-medium text-lg">{PLANET_SYMBOLS[planet.planet] || planet.planet}</span>
                <span className="text-xs bg-yellow-200 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200 px-2 py-1 rounded">
                  {planet.exact_cazimi ? 'Exact Cazimi!' : 'Cazimi'}
                </span>
              </div>
              <div className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
                Distance from Sun: {planet.distance_from_sun.toFixed(2)}° 
                {planet.exact_cazimi && ' (Within 3 arcminutes - maximum dignity)'}
              </div>
              <div className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                Dignity Effect: +{planet.dignity_effect || 6} (Heart of the Sun brings ultimate strength)
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Combusted Planets */}
      {solarData.combusted_planets?.length > 0 && (
        <div>
          <h5 className="text-sm font-semibold text-red-600 dark:text-red-400 mb-3">
            Combusted - Severely Weakened
          </h5>
          {solarData.combusted_planets.map((planet, index) => (
            <div key={index} className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 mb-2">
              <div className="flex items-center justify-between">
                <span className="font-medium text-lg">{PLANET_SYMBOLS[planet.planet] || planet.planet}</span>
                <span className="text-xs bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200 px-2 py-1 rounded">
                  Combusted
                </span>
              </div>
              {planet.traditional_exception && (
                <div className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                  ⚠️ Traditional Exception: Enhanced engine found visibility exception for this planet
                </div>
              )}
              <div className="text-xs text-red-600 dark:text-red-400 mt-1">
                Dignity Effect: {planet.dignity_effect || -5} (Burnt by solar rays)
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Under the Beams */}
      {solarData.under_beams_planets?.length > 0 && (
        <div>
          <h5 className="text-sm font-semibold text-orange-600 dark:text-orange-400 mb-3">
            Under the Beams - Moderately Weakened
          </h5>
          {solarData.under_beams_planets.map((planet, index) => (
            <div key={index} className="p-3 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 mb-2">
              <div className="flex items-center justify-between">
                <span className="font-medium text-lg">{PLANET_SYMBOLS[planet.planet] || planet.planet}</span>
                <span className="text-xs bg-orange-200 dark:bg-orange-800 text-orange-800 dark:text-orange-200 px-2 py-1 rounded">
                  Under Beams
                </span>
              </div>
              <div className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                Dignity Effect: {planet.dignity_effect || -3} (Obscured by solar rays)
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* No Significant Conditions */}
      {solarData.significant_conditions === 0 && (
        <div className="text-center py-4 text-gray-500 dark:text-gray-400">
          <Sun className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No significant solar conditions affecting planets</p>
          <p className="text-xs mt-1">All planets are free from solar interference</p>
        </div>
      )}

      {/* Removed explanatory note per request */}
    </div>
  );
};

// NEW: Enhanced Chart Wheel Component with Planet Filtering
const EnhancedChartWheel = ({ chart, darkMode }) => {
  const [selectedPlanet, setSelectedPlanet] = useState(null);
  const [hoveredPlanet, setHoveredPlanet] = useState(null);
  const [isolatedPlanet, setIsolatedPlanet] = useState(null); // New state for legend chip isolation
  const [showPlanetBadges, setShowPlanetBadges] = useState(true); // Keep badges ON by default
  
  const planets = chart.chart_data?.planets || {};
  const aspects = chart.chart_data?.aspects || [];
  const houses = chart.chart_data?.houses || [];
  const solarConditions = chart.chart_data?.solar_conditions_summary;
  const chartData = chart.chart_data;
  
  // Calculate chart rotation: ASC should be at 180° (west/left) - clockwise mapping
  const ascendant = chartData?.ascendant || houses[0] || 0;
  
  // Clockwise angle converter: ASC at 180° (left), MC at 90° (top), DSC at 0° (right), IC at 270° (bottom)
  const toAngle = (L) => {
    const a = 180 + (ascendant ?? 0) - (L ?? 0);   // clockwise mapping
    const m = a % 360;
    return m < 0 ? m + 360 : m;
  };
  
  const zodiacSigns = [
    'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
    'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'
  ];


  const signSymbols = {
    'Aries': '♈', 'Taurus': '♉', 'Gemini': '♊', 'Cancer': '♋',
    'Leo': '♌', 'Virgo': '♍', 'Libra': '♎', 'Scorpio': '♏',
    'Sagittarius': '♐', 'Capricorn': '♑', 'Aquarius': '♒', 'Pisces': '♓'
  };


  // Generate degree ticks (every 10 degrees)
  const degreeTicks = [];
  for (let i = 0; i < 360; i += 10) {
    const angle = toAngle(i); // Use clockwise mapping
    const radius = i % 30 === 0 ? 175 : 170; // Longer ticks for sign boundaries
    const innerRadius = i % 30 === 0 ? 155 : 165; // Sign boundaries go deeper
    const x1 = Math.cos((angle * Math.PI) / 180) * innerRadius;
    const y1 = Math.sin((angle * Math.PI) / 180) * innerRadius;
    const x2 = Math.cos((angle * Math.PI) / 180) * radius;
    const y2 = Math.sin((angle * Math.PI) / 180) * radius;
    
    degreeTicks.push({
      x1: 192 + x1,
      y1: 192 + y1,
      x2: 192 + x2,
      y2: 192 + y2,
      isSignBoundary: i % 30 === 0,
      degree: i
    });
  }

  // Generate house sectors
  // Normalize to 0..360 range reliably (JS % keeps sign)
  const normalizeAngle = (a) => {
    const m = a % 360;
    return m < 0 ? m + 360 : m;
  };

  // Ensure we have exactly 12 cusps (some sources may return >12)
  const cusps = Array.isArray(houses)
    ? (houses.length >= 12 ? houses.slice(0, 12) : [])
    : [];

  const houseSectors = [];
  if (cusps.length === 12) {
    for (let i = 0; i < 12; i++) {
      // Use clockwise mapping
      const cur = toAngle(cusps[i]);
      const nxt = toAngle(cusps[(i + 1) % 12]);

      // Clockwise span from cur to nxt
      const delta = normalizeAngle(cur - nxt);
      const end = cur - delta;

      const largeArc = delta > 180 ? 1 : 0; // SVG arc large-arc-flag
      const startX = 192 + Math.cos((cur * Math.PI) / 180) * 140;
      const startY = 192 + Math.sin((cur * Math.PI) / 180) * 140;
      const endX = 192 + Math.cos((end * Math.PI) / 180) * 140;
      const endY = 192 + Math.sin((end * Math.PI) / 180) * 140;

      const mid = normalizeAngle(cur - delta / 2); // Clockwise midpoint

      // House numbers map directly now with clockwise mapping
      const houseNumber = i + 1;
      
      houseSectors.push({
        houseNumber: houseNumber,
        startAngle: cur,
        endAngle: end,
        pathData: `M 192 192 L ${startX} ${startY} A 140 140 0 ${largeArc} 0 ${endX} ${endY} Z`, // sweep=0 for clockwise
        midAngle: mid,
        labelX: 192 + Math.cos((mid * Math.PI) / 180) * 125,
        labelY: 192 + Math.sin((mid * Math.PI) / 180) * 125
      });
    }
  }

  // NEW: Get enhanced planet styling based on solar conditions
  const getEnhancedPlanetStyling = (planetName, planetData) => {
    let gradient = 'from-gray-400 to-gray-600'; // Default
    let borderClass = '';
    let effectIcon = null;

    // Check dignity
    if (planetData.dignity_score > 0) {
      gradient = 'from-emerald-400 to-emerald-600';
    } else if (planetData.dignity_score < 0) {
      gradient = 'from-red-400 to-red-600';
    }

    // Check solar conditions (enhanced)
    if (solarConditions) {
      const cazimiPlanet = solarConditions.cazimi_planets?.find(p => p.planet === planetName);
      const combustedPlanet = solarConditions.combusted_planets?.find(p => p.planet === planetName);
      const underBeamsPlanet = solarConditions.under_beams_planets?.find(p => p.planet === planetName);

      if (cazimiPlanet) {
        gradient = 'from-yellow-300 to-yellow-500';
        borderClass = 'ring-2 ring-yellow-300 ring-opacity-75';
        effectIcon = <Flame className="w-2 h-2 text-yellow-600" />;
      } else if (combustedPlanet) {
        gradient = 'from-red-500 to-red-700';
        borderClass = 'ring-2 ring-red-400 ring-opacity-75';
        effectIcon = <Flame className="w-2 h-2 text-red-800" />;
      } else if (underBeamsPlanet) {
        gradient = 'from-orange-400 to-orange-600';
        borderClass = 'ring-2 ring-orange-300 ring-opacity-75';
        effectIcon = <EyeIcon className="w-2 h-2 text-orange-700" />;
      }
    }

    return { gradient, borderClass, effectIcon };
  };

  const handlePlanetClick = (planetName, planetData) => {
    setSelectedPlanet({ name: planetName, data: planetData });
  };

  const handleKeyPress = (event, planetName, planetData) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handlePlanetClick(planetName, planetData);
    }
  };

  // Chart info data
  const timezoneInfo = chartData?.timezone_info;
  
  // Helper function to check if aspect involves isolated planet
  const isAspectVisible = (aspect) => {
    if (!isolatedPlanet) return true; // Show all if no planet isolated
    return aspect.planet1 === isolatedPlanet || aspect.planet2 === isolatedPlanet;
  };
  
  // Helper function to check if planet should be dimmed
  const isPlanetDimmed = (planetName) => {
    if (!isolatedPlanet) return false; // No dimming if no planet isolated
    return planetName !== isolatedPlanet;
  };

  // Button class names
  const getShowAllButtonClass = () => {
    const baseClasses = 'px-2 py-1.5 rounded-md text-xs font-medium transition-all duration-200 transform hover:scale-105 active:scale-95 border-t border-white/20';
    if (isolatedPlanet === null) {
      return `${baseClasses} bg-gradient-to-br from-indigo-500 to-indigo-700 text-white shadow-lg shadow-indigo-200 dark:shadow-indigo-900/30`;
    } else if (darkMode) {
      return `${baseClasses} bg-gradient-to-br from-gray-600 to-gray-800 hover:from-gray-500 hover:to-gray-700 text-gray-200 shadow-md shadow-gray-900/30`;
    } else {
      return `${baseClasses} bg-gradient-to-br from-gray-100 to-gray-300 hover:from-gray-200 hover:to-gray-400 text-gray-700 shadow-md shadow-gray-300/50`;
    }
  };

  const getPlanetButtonClass = (isActive) => {
    const baseClasses = 'relative flex items-center space-x-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-all duration-200 transform hover:scale-105 active:scale-95 border-t border-white/20';
    if (isActive) {
      return `${baseClasses} bg-gradient-to-br from-indigo-500 to-indigo-700 text-white shadow-lg shadow-indigo-200 dark:shadow-indigo-900/30 ring-1 ring-indigo-300`;
    } else if (darkMode) {
      return `${baseClasses} bg-gradient-to-br from-gray-600 to-gray-800 hover:from-gray-500 hover:to-gray-700 text-gray-200 shadow-md shadow-gray-900/30`;
    } else {
      return `${baseClasses} bg-gradient-to-br from-gray-100 to-gray-300 hover:from-gray-200 hover:to-gray-400 text-gray-700 shadow-md shadow-gray-300/50`;
    }
  };

  return (
    <div className="flex flex-col items-center space-y-4">
      {/* Chart Info Header */}
        <div className={`w-full p-4 rounded-lg border ${
          darkMode ? 'bg-gray-800/30 border-gray-600' : 'bg-gray-50/80 border-gray-200'
        }`}>
        <div className="text-center space-y-1">
          <div className="text-sm font-medium">
            {timezoneInfo?.local_time ? new Date(timezoneInfo.local_time).toLocaleString('en-US', {
              weekday: 'long',
              year: 'numeric', 
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              timeZoneName: 'short'
            }) : 'Chart Time Not Available'}
          </div>
          <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            {timezoneInfo?.location_name || 'Location Not Available'}
          </div>
          {timezoneInfo?.coordinates && (
            <div className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
              {timezoneInfo.coordinates.latitude.toFixed(4)}°, {timezoneInfo.coordinates.longitude.toFixed(4)}°
            </div>
          )}
        </div>
      </div>
      {/* Confidence details panel removed per request */}

      {/* Chart Wheel */}
      <div 
        className={`w-96 h-96 rounded-full border-4 ${
          darkMode ? 'border-gray-600' : 'border-gray-300'
        } relative bg-gradient-to-br ${
          darkMode ? 'from-gray-800 to-gray-900' : 'from-blue-50 to-indigo-50'
        }`}
        role="img"
        aria-label="Enhanced horary chart wheel with solar conditions"
      >
        
        {/* Main SVG for precise drawing */}
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 384 384">
          
          {/* Gradient definitions for glassy axes */}
          <defs>
            <linearGradient id="glassyAxisGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.8)" />
              <stop offset="50%" stopColor="rgba(255,255,255,0.6)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0.4)" />
            </linearGradient>
            <filter id="glassyGlow">
              <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
              <feMerge> 
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
          
          {/* Degree ticks and sign boundaries */}
          {degreeTicks.map((tick, index) => (
            <line
              key={index}
              x1={tick.x1}
              y1={tick.y1}
              x2={tick.x2}
              y2={tick.y2}
              stroke={darkMode ? '#6b7280' : '#9ca3af'}
              strokeWidth={tick.isSignBoundary ? '2' : '1'}
              opacity={tick.isSignBoundary ? 0.8 : 0.4}
            />
          ))}
          
          {/* House sectors */}
          {houseSectors.map((sector, index) => (
            <g key={`house-${index}`}>
              <path
                d={sector.pathData}
                fill="none"
                stroke={darkMode ? '#4b5563' : '#d1d5db'}
                strokeWidth="1"
                strokeDasharray="3,3"
                opacity={0.5}
              />
              {/* House numbers */}
              <text
                x={sector.labelX}
                y={sector.labelY}
                textAnchor="middle"
                dominantBaseline="middle"
                className={`text-xs font-medium ${darkMode ? 'fill-gray-400' : 'fill-gray-600'}`}
              >
                {sector.houseNumber}
              </text>
            </g>
          ))}
          
          {/* Zodiac signs ring */}
          <circle
            cx="192"
            cy="192"
            r="160"
            fill="none"
            stroke={darkMode ? '#6b7280' : '#9ca3af'}
            strokeWidth="2"
            strokeDasharray="5,5"
            opacity={0.6}
          />
          
          {/* Principal Axes - ASC/DSC and MC/IC using actual astrological points */}
          {cusps.length === 12 && (() => {
            // Use the actual ascendant value, not house cusp
            const ascendantDegree = chartData?.ascendant || cusps[0]; // Primary ascendant value
            const ascAngle = toAngle(ascendantDegree); // ASC at 180° (left)
            const dscAngle = normalizeAngle(ascAngle + 180); // DSC opposite ASC
            
            // MC and IC from correct house cusps with proper fallbacks
            const mcDegree = cusps?.[9] ?? normalizeAngle(ascendantDegree - 90); // MC = ASC - 90°
            const mcAngle = toAngle(mcDegree); // MC at 90° (top) 
            const icAngle = normalizeAngle(mcAngle + 180); // IC opposite MC at 270° (bottom)
            
            // Calculate line endpoints
            const axisRadius = 180; // Extend to outer edge
            
            // ASC-DSC line
            const ascX1 = 192 + Math.cos((ascAngle * Math.PI) / 180) * axisRadius;
            const ascY1 = 192 + Math.sin((ascAngle * Math.PI) / 180) * axisRadius;
            const dscX2 = 192 + Math.cos((dscAngle * Math.PI) / 180) * axisRadius;
            const dscY2 = 192 + Math.sin((dscAngle * Math.PI) / 180) * axisRadius;
            
            // MC-IC line
            const mcX1 = 192 + Math.cos((mcAngle * Math.PI) / 180) * axisRadius;
            const mcY1 = 192 + Math.sin((mcAngle * Math.PI) / 180) * axisRadius;
            const icX2 = 192 + Math.cos((icAngle * Math.PI) / 180) * axisRadius;
            const icY2 = 192 + Math.sin((icAngle * Math.PI) / 180) * axisRadius;
            
            // Label positions (inside the chart boundaries)
            const labelRadius = 168; // Keep text comfortably inside the viewBox
            const ascLabelX = 192 + Math.cos((ascAngle * Math.PI) / 180) * labelRadius;
            const ascLabelY = 192 + Math.sin((ascAngle * Math.PI) / 180) * labelRadius;
            const dscLabelX = 192 + Math.cos((dscAngle * Math.PI) / 180) * labelRadius;
            const dscLabelY = 192 + Math.sin((dscAngle * Math.PI) / 180) * labelRadius;
            const mcLabelX = 192 + Math.cos((mcAngle * Math.PI) / 180) * labelRadius;
            const mcLabelY = 192 + Math.sin((mcAngle * Math.PI) / 180) * labelRadius;
            const icLabelX = 192 + Math.cos((icAngle * Math.PI) / 180) * labelRadius;
            const icLabelY = 192 + Math.sin((icAngle * Math.PI) / 180) * labelRadius;
            
            return (
              <g>
                {/* Glassy transparent ASC-DSC axis */}
                <line
                  x1={ascX1} y1={ascY1}
                  x2={dscX2} y2={dscY2}
                  stroke="url(#glassyAxisGradient)"
                  strokeWidth="3"
                  opacity="0.9"
                  filter="url(#glassyGlow)"
                />
                
                {/* Glassy transparent MC-IC axis */}
                <line
                  x1={mcX1} y1={mcY1}
                  x2={icX2} y2={icY2}
                  stroke="url(#glassyAxisGradient)"
                  strokeWidth="3"
                  opacity="0.9"
                  filter="url(#glassyGlow)"
                />
                
                {/* Axis label backgrounds */}
                <rect x={ascLabelX - 12} y={ascLabelY - 8} width="24" height="16" rx="3" 
                      fill={darkMode ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)'} 
                      stroke={darkMode ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'}
                      strokeWidth="1" />
                <rect x={dscLabelX - 12} y={dscLabelY - 8} width="24" height="16" rx="3" 
                      fill={darkMode ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)'} 
                      stroke={darkMode ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'}
                      strokeWidth="1" />
                <rect x={mcLabelX - 10} y={mcLabelY - 8} width="20" height="16" rx="3" 
                      fill={darkMode ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)'} 
                      stroke={darkMode ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'}
                      strokeWidth="1" />
                <rect x={icLabelX - 8} y={icLabelY - 8} width="16" height="16" rx="3" 
                      fill={darkMode ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)'} 
                      stroke={darkMode ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'}
                      strokeWidth="1" />

                {/* Axis labels */}
                <text x={ascLabelX} y={ascLabelY} textAnchor="middle" dominantBaseline="middle" 
                      className={`text-sm font-bold ${darkMode ? 'fill-white' : 'fill-gray-800'}`}>
                  ASC
                </text>
                <text x={dscLabelX} y={dscLabelY} textAnchor="middle" dominantBaseline="middle" 
                      className={`text-sm font-bold ${darkMode ? 'fill-white' : 'fill-gray-800'}`}>
                  DSC
                </text>
                <text x={mcLabelX} y={mcLabelY} textAnchor="middle" dominantBaseline="middle" 
                      className={`text-sm font-bold ${darkMode ? 'fill-white' : 'fill-gray-800'}`}>
                  MC
                </text>
                <text x={icLabelX} y={icLabelY} textAnchor="middle" dominantBaseline="middle" 
                      className={`text-sm font-bold ${darkMode ? 'fill-white' : 'fill-gray-800'}`}>
                  IC
                </text>
              </g>
            );
          })()}

          {/* Enhanced aspect lines with better styling */}
          {aspects.map((aspect, index) => {
            const planet1 = planets[aspect.planet1];
            const planet2 = planets[aspect.planet2];
            
            if (!planet1 || !planet2) return null;
            
            // Skip aspect if planet isolation is active and this aspect doesn't involve the isolated planet
            if (!isAspectVisible(aspect)) return null;
            
            const angle1 = toAngle(planet1.longitude || 0);
            const angle2 = toAngle(planet2.longitude || 0);
            const radius = 120;
            
            const x1 = 192 + Math.cos((angle1 * Math.PI) / 180) * radius;
            const y1 = 192 + Math.sin((angle1 * Math.PI) / 180) * radius;
            const x2 = 192 + Math.cos((angle2 * Math.PI) / 180) * radius;
            const y2 = 192 + Math.sin((angle2 * Math.PI) / 180) * radius;
            
            const aspectColors = {
              'Conjunction': '#fbbf24',
              'Sextile': '#10b981',
              'Square': '#ef4444',
              'Trine': '#3b82f6',
              'Opposition': '#8b5cf6'
            };
            
          const color = aspectColors[aspect.aspect] || '#6b7280';
            // Respect backend applying flag (direction-aware).
            const isApplying = aspect.applying === true;

            return (
              <g key={index}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={color}
                  strokeWidth={isApplying ? "3" : "2"}
                  strokeDasharray={isApplying ? "none" : "5,5"}
                  opacity={isApplying ? 0.9 : 0.6}
                />
                {/* Enhanced: Add glow effect for applying aspects */}
                {isApplying && (
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={color}
                    strokeWidth="6"
                    opacity="0.3"
                  />
                )}
              </g>
            );
          })}
        </svg>
        
        {/* Zodiac Signs - moved outward for better spacing */}
        <div className="absolute inset-8 rounded-full">
          {zodiacSigns.map((sign, index) => {
            // Place glyphs at sign midpoints (index*30 + 15) for clearer visual association
            const angle = toAngle(index * 30 + 15); // Use clockwise mapping
            const radius = 166; // Increased from 164 to push outward by ~2px more
            const x = Math.cos((angle * Math.PI) / 180) * radius;
            const y = Math.sin((angle * Math.PI) / 180) * radius;
            
            return (
              <div
                key={sign}
                className="absolute text-lg transform -translate-x-1/2 -translate-y-1/2 select-none font-semibold"
                style={{
                  left: `calc(50% + ${x}px)`,
                  top: `calc(50% + ${y}px)`
                }}
                title={sign}
              >
                {signSymbols[sign]}
              </div>
            );
          })}
        </div>
        
        {/* Enhanced planet positions with solar condition styling */}
        {Object.entries(planets).map(([planetName, planetData], index) => {
            const longitude = planetData.longitude || 0;
            const angle = toAngle(longitude); // Use clockwise mapping
            const radius = 120;
            const x = Math.cos((angle * Math.PI) / 180) * radius;
            const y = Math.sin((angle * Math.PI) / 180) * radius;
            
            const { gradient, borderClass, effectIcon } = getEnhancedPlanetStyling(planetName, planetData);
            const degreeInSign = (longitude % 30).toFixed(1);
            const computedSign = getSignFromDegree(longitude);
            // Debug mismatch between backend sign and computed sign
            if (planetData.sign && planetData.sign !== computedSign) {
              // eslint-disable-next-line no-console
              console.warn('[WHEEL_DEBUG] Sign mismatch:', { planetName, longitude, backendSign: planetData.sign, computedSign });
            }
            const planetLabel = `${planetName} at ${degreeInSign}° ${computedSign}`;
            const isSelected = selectedPlanet?.name === planetName;
            const isHovered = hoveredPlanet === planetName;
            const isDimmed = isPlanetDimmed(planetName);

            // Remove degree labels - no longer needed
            
            return (
              <div key={planetName}>
                {/* Planet Glyph */}
                <div className="absolute" style={{
                  left: `calc(50% + ${x}px)`,
                  top: `calc(50% + ${y}px)`
                }}>
                  <button
                    className={`relative ${showPlanetBadges ? `w-10 h-10 rounded-full bg-gradient-to-br ${gradient} ${borderClass} shadow-lg` : ''} flex items-center justify-center ${showPlanetBadges ? 'text-white' : darkMode ? 'text-gray-200' : 'text-gray-800'} text-xl font-bold transform -translate-x-1/2 -translate-y-1/2 transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                      isSelected || isHovered ? 'scale-125 z-20' : 'hover:scale-110 z-10'
                    } ${isDimmed ? 'opacity-30' : 'opacity-100'}`}
                    onClick={() => handlePlanetClick(planetName, planetData)}
                    onKeyDown={(e) => handleKeyPress(e, planetName, planetData)}
                    onMouseEnter={() => setHoveredPlanet(planetName)}
                    onMouseLeave={() => setHoveredPlanet(null)}
                    aria-label={planetLabel}
                    title={`${planetLabel}, Dignity: ${planetData.dignity_score}, House: ${planetData.house}`}
                    tabIndex={0}
                  >
                    {PLANET_SYMBOLS[planetName] || planetName.charAt(0)}
                    
                    {/* Enhanced solar condition indicator */}
                    {effectIcon && showPlanetBadges && (
                      <div className="absolute -top-1 -right-1 bg-white rounded-full p-0.5">
                        {effectIcon}
                      </div>
                    )}
                    
                    {/* Retrograde indicator */}
                    {planetData.retrograde && showPlanetBadges && (
                      <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-orange-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-xs font-bold">R</span>
                      </div>
                    )}
                  </button>
                </div>
              </div>
            );
        })}
        
        {/* Hover labels positioned along radial lines */}
        {hoveredPlanet && (() => {
          const planetData = planets[hoveredPlanet];
          if (!planetData) return null;
          
          const longitude = planetData.longitude || 0;
          const angle = toAngle(longitude); // Use clockwise mapping
          const labelRadius = 170; // Position outside zodiac signs
          const labelX = Math.cos((angle * Math.PI) / 180) * labelRadius;
          const labelY = Math.sin((angle * Math.PI) / 180) * labelRadius;
          const computedSign = getSignFromDegree(longitude);
          
          return (
            <div 
              className={`absolute z-40 px-3 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap pointer-events-none transition-all duration-200 ${
                darkMode 
                  ? 'bg-gray-900/95 text-white border border-gray-600 backdrop-blur-sm' 
                  : 'bg-white/95 text-gray-800 border border-gray-300 backdrop-blur-sm'
              } shadow-xl`}
              style={{
                left: `calc(50% + ${labelX}px)`,
                top: `calc(50% + ${labelY}px)`,
                transform: 'translate(-50%, -50%)',
              }}
            >
              {hoveredPlanet} {(longitude % 30).toFixed(1)}° {signSymbols[computedSign]} (H{planetData.house})
            </div>
          );
        })()}
        
        {/* Center with enhanced styling */}
        <div className="absolute inset-1/2 w-6 h-6 bg-gradient-to-br from-teal-400 to-indigo-600 rounded-full transform -translate-x-1/2 -translate-y-1/2 shadow-lg"></div>
      </div>

      {/* Enhanced Selected Planet Details */}
      {selectedPlanet && (
        <div className={`mt-4 p-4 rounded-lg border ${
          darkMode ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-200'
        } max-w-md`}>
          <h4 className="font-semibold mb-2 flex items-center">
            {selectedPlanet.name}
            {selectedPlanet.data.retrograde && (
              <span className="ml-2 px-2 py-1 bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 rounded text-xs">
                Retrograde
              </span>
            )}
          </h4>
          <div className="text-sm space-y-1">
            <div>Position: {(selectedPlanet.data.longitude % 30).toFixed(1)}° {selectedPlanet.data.sign}</div>
            <div>House: {selectedPlanet.data.house}</div>
            <div>Dignity Score: {selectedPlanet.data.dignity_score > 0 ? '+' : ''}{selectedPlanet.data.dignity_score}</div>
            {selectedPlanet.data.speed && (
              <div>Daily Motion: {selectedPlanet.data.speed.toFixed(2)}°/day</div>
            )}
            
            {/* NEW: Enhanced solar condition details */}
            {solarConditions && (
              <>
                {solarConditions.cazimi_planets?.find(p => p.planet === selectedPlanet.name) && (
                  <div className="text-yellow-600 dark:text-yellow-400 font-medium">
                    ☀️ Cazimi - Heart of the Sun
                  </div>
                )}
                {solarConditions.combusted_planets?.find(p => p.planet === selectedPlanet.name) && (
                  <div className="text-red-600 dark:text-red-400 font-medium">
                    🔥 Combusted - Severely weakened
                  </div>
                )}
                {solarConditions.under_beams_planets?.find(p => p.planet === selectedPlanet.name) && (
                  <div className="text-orange-600 dark:text-orange-400 font-medium">
                    👁️ Under the Beams - Moderately weakened
                  </div>
                )}
              </>
            )}
          </div>
          <button 
            onClick={() => setSelectedPlanet(null)}
            className="mt-2 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            Close
          </button>
        </div>
      )}

      {/* Chart Display Controls */}
      <div className={`w-full p-4 rounded-lg border ${
        darkMode ? 'bg-gray-800/30 border-gray-600' : 'bg-gray-50/80 border-gray-200'
      }`}>
        {/* Display Options */}
        <div className="mb-3 flex flex-wrap justify-center gap-3">
          <label className="flex items-center space-x-2 text-xs">
            <input
              type="checkbox"
              checked={showPlanetBadges}
              onChange={(e) => setShowPlanetBadges(e.target.checked)}
              className="rounded"
            />
            <span className={darkMode ? 'text-gray-300' : 'text-gray-700'}>Planet Colors & Indicators</span>
          </label>
        </div>

        <div className="text-center">
          <div className={`text-xs font-medium mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            Planetary Filter
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {/* Show All Button */}
            <button
              onClick={() => {
                setIsolatedPlanet(null);
                setSelectedPlanet(null);
              }}
              className={getShowAllButtonClass()}
            >
              All
            </button>
            
            {/* Planet Filter Chips */}
            {Object.entries(planets).map(([planetName, planetData]) => {
              const isActive = isolatedPlanet === planetName;
              const { gradient } = getEnhancedPlanetStyling(planetName, planetData);
              
              return (
                <button
                  key={planetName}
                  onClick={() => {
                    if (isActive) {
                      // If already active, deactivate both isolation and selection
                      setIsolatedPlanet(null);
                      setSelectedPlanet(null);
                    } else {
                      // If not active, activate isolation and show planet details
                      setIsolatedPlanet(planetName);
                      setSelectedPlanet({ name: planetName, data: planetData });
                    }
                  }}
                  className={getPlanetButtonClass(isActive)}
                  title={`${isActive ? 'Hide details and show all planets' : `Show ${planetName} details and isolate its aspects`}`}
                >
                  <div className={`w-4 h-4 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white text-xs font-bold shadow-sm`}>
                    {PLANET_SYMBOLS[planetName]}
                  </div>
                  <span className="hidden sm:inline">{planetName}</span>
                </button>
              );
            })}
          </div>
        </div>
        {/* Confidence details moved to header panel */}
      </div>
    </div>
  );
};

// Preserve existing components (DignityTablePanel, AspectsTablePanel, NotesPanel, etc.)
const DignityTablePanel = ({ chart, darkMode }) => {
  const planets = chart.chart_data?.planets || {};
  
  const getDignityCategory = (score) => {
    if (score >= 5) return { label: 'Excellent', color: 'text-emerald-600 dark:text-emerald-400' };
    if (score >= 3) return { label: 'Strong', color: 'text-green-600 dark:text-green-400' };
    if (score >= 1) return { label: 'Good', color: 'text-blue-600 dark:text-blue-400' };
    if (score >= -1) return { label: 'Neutral', color: 'text-gray-600 dark:text-gray-400' };
    if (score >= -3) return { label: 'Weak', color: 'text-orange-600 dark:text-orange-400' };
    return { label: 'Poor', color: 'text-red-600 dark:text-red-400' };
  };

  const getStrengthBarWidth = (score) => {
    // Use magnitude for width, clamp to reasonable range (-10 to +10)
    const magnitude = Math.abs(score);
    const clampedMagnitude = Math.min(magnitude, 10);
    return Math.max(5, (clampedMagnitude / 10) * 100); // Minimum 5% for visibility
  };

  const getStrengthBarColor = (score) => {
    if (score > 0) {
      return 'bg-gradient-to-r from-emerald-400 to-emerald-600';
    } else if (score < 0) {
      return 'bg-gradient-to-r from-red-400 to-red-600';
    } else {
      return 'bg-gradient-to-r from-gray-400 to-gray-500';
    }
  };

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-600">
              <th className="text-left py-2 font-medium">Planet</th>
              <th className="text-left py-2 font-medium">Sign</th>
              <th className="text-left py-2 font-medium">House</th>
              <th className="text-left py-2 font-medium">Dignity</th>
              <th className="text-left py-2 font-medium">Strength</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(planets).map(([planetName, planetData]) => {
              const dignityInfo = getDignityCategory(planetData.dignity_score);
              const strengthWidth = getStrengthBarWidth(planetData.dignity_score);
              
              return (
                <tr key={planetName} className="border-b border-gray-100 dark:border-gray-700 last:border-b-0">
                  <td className="py-3">
                    <div className="flex items-center">
                      <span className="font-medium">{planetName}</span>
                      {planetData.retrograde && (
                        <span className="ml-2 px-2 py-1 text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded">
                          R
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3">
                    <span className="text-gray-600 dark:text-gray-300">{planetData.sign}</span>
                  </td>
                  <td className="py-3">
                    <span className="text-gray-600 dark:text-gray-300">{planetData.house}</span>
                  </td>
                  <td className="py-3">
                    <div className="flex items-center space-x-2">
                      <span className={`font-medium ${dignityInfo.color}`}>
                        {dignityInfo.label}
                      </span>
                    </div>
                  </td>
                  <td className="py-3">
                    <div className="flex items-center space-x-3">
                      <span className={`font-medium min-w-[2.5rem] text-right ${dignityInfo.color}`}>
                        {planetData.dignity_score > 0 ? '+' : ''}{planetData.dignity_score}
                      </span>
                      <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-3 relative">
                        <div 
                          className={`h-3 rounded-full transition-all duration-300 ${getStrengthBarColor(planetData.dignity_score)}`}
                          style={{ width: `${strengthWidth}%` }}
                          role="progressbar"
                          aria-label={`Dignity strength: ${planetData.dignity_score > 0 ? '+' : ''}${planetData.dignity_score}`}
                          aria-valuenow={planetData.dignity_score}
                          aria-valuemin={-10}
                          aria-valuemax={10}
                        />
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      
      <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
        <div>• R = Retrograde motion</div>
        <div>• Strength bars show relative dignity (-10 to +10 scale)</div>
        <div>• Green bars = positive dignity, Red bars = negative dignity</div>
        
      </div>
    </div>
  );
};

// Enhanced Aspects Table Panel (preserved with minor enhancements)
const AspectsTablePanel = ({ chart, darkMode }) => {
  const aspects = chart.chart_data?.aspects || [];
  
  const getAspectColor = (aspectName) => {
    switch (aspectName) {
      case 'Conjunction': return 'text-yellow-600 dark:text-yellow-400';
      case 'Sextile': return 'text-emerald-600 dark:text-emerald-400';
      case 'Square': return 'text-red-600 dark:text-red-400';
      case 'Trine': return 'text-blue-600 dark:text-blue-400';
      case 'Opposition': return 'text-purple-600 dark:text-purple-400';
      default: return 'text-gray-600 dark:text-gray-400';
    }
  };

  const getAspectSymbol = (aspectName) => {
    switch (aspectName) {
      case 'Conjunction': return '☌';
      case 'Sextile': return '⚹';
      case 'Square': return '□';
      case 'Trine': return '△';
      case 'Opposition': return '☍';
      default: return '○';
    }
  };

  const getOrbQuality = (orb) => {
    if (orb <= 1) return { label: 'Exact', color: 'text-emerald-600 dark:text-emerald-400' };
    if (orb <= 3) return { label: 'Close', color: 'text-blue-600 dark:text-blue-400' };
    if (orb <= 6) return { label: 'Moderate', color: 'text-amber-600 dark:text-amber-400' };
    return { label: 'Wide', color: 'text-gray-600 dark:text-gray-400' };
  };

  return (
    <div className="space-y-4">
      {aspects.length === 0 ? (
        <div className="text-center py-6 text-gray-500 dark:text-gray-400">
          No major aspects found
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-600">
                <th className="text-left py-2 font-medium">Aspect</th>
                <th className="text-left py-2 font-medium">Orb</th>
                <th className="text-left py-2 font-medium">Status</th>
                <th className="text-left py-2 font-medium">Quality</th>
              </tr>
            </thead>
            <tbody>
              {aspects.map((aspect, index) => {
                const aspectColor = getAspectColor(aspect.aspect);
                const aspectSymbol = getAspectSymbol(aspect.aspect);
                const orbQuality = getOrbQuality(aspect.orb);
                // Prefer backend classification
                const isApplying = aspect.applying === true;
                
                const showCrossSign = (aspect.perfection_within_sign === false && (aspect.time_to_perfection ?? 0) > 0);
                return (
                  <tr key={index} className="border-b border-gray-100 dark:border-gray-700 last:border-b-0">
                    <td className="py-3">
                      <div className="flex items-center space-x-2">
                        <span className={`text-lg ${aspectColor}`}>{aspectSymbol}</span>
                        <div>
                          <div className="font-medium">
                            {aspect.planet1} {aspect.aspect} {aspect.planet2}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono">{aspect.orb?.toFixed(1)}°</span>
                        <span className={`text-xs ${orbQuality.color}`}>
                          {orbQuality.label}
                        </span>
                      </div>
                    </td>
                    <td className="py-3">
                      <span className={`px-2 py-1 text-xs rounded ${
                        isApplying
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                          : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      }`}>
                        {isApplying ? 'Applying' : 'Separating'}
                      </span>
                    </td>
                    <td className="py-3">
                      <div className="text-xs text-gray-600 dark:text-gray-300 space-y-1">
                        {/* Show perfection only if within current signs; otherwise note cross-sign */}
                        {isApplying ? 'Will perfect' : (aspect.perfection_within_sign === false ? "Won't perfect before sign change" : 'Past perfection')}
                        {aspect.exact_time && aspect.perfection_within_sign === true && (
                          <div className="text-purple-600 dark:text-purple-400">
                            {new Date(aspect.exact_time).toLocaleDateString()}
                          </div>
                        )}
                        {showCrossSign && (
                          <span className="inline-block px-2 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                            Cross‑sign
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      
      <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
        <div>• Applying aspects are forming and will perfect</div>
        <div>• Separating aspects have already perfected</div>
        <div>• Orb quality: Exact (≤1°), Close (≤3°), Moderate (≤6°), Wide (&gt;6°)</div>
        <div>• Enhanced engine checks for future retrograde frustration</div>
      </div>
    </div>
  );
};

// Notes Panel Component (preserved)
const NotesPanel = ({ noteText, setNoteText, isEditing, setIsEditing, onSave, darkMode }) => {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h4 className="font-medium">Chart Notes</h4>
        {!isEditing ? (
          <button
            onClick={() => setIsEditing(true)}
            className="flex items-center space-x-1 text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 text-sm"
          >
            <Edit3 className="w-4 h-4" />
            <span>Edit</span>
          </button>
        ) : (
          <div className="flex space-x-2">
            <button
              onClick={onSave}
              className="flex items-center space-x-1 px-3 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded text-sm hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-colors"
            >
              <Save className="w-4 h-4" />
              <span>Save</span>
            </button>
            <button
              onClick={() => setIsEditing(false)}
              className="flex items-center space-x-1 px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              <X className="w-4 h-4" />
              <span>Cancel</span>
            </button>
          </div>
        )}
      </div>
      
      {isEditing ? (
        <textarea
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder="Add your notes about this enhanced chart... (Markdown supported)"
          className={`w-full h-40 p-3 rounded-lg border transition-all duration-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none ${
            darkMode 
              ? 'bg-gray-700/50 border-gray-600 text-white placeholder-gray-400' 
              : 'bg-white/70 border-gray-200 text-gray-900 placeholder-gray-500'
          }`}
        />
      ) : (
        <div className={`min-h-20 p-3 rounded-lg border ${
          darkMode ? 'border-gray-600 bg-gray-700/30' : 'border-gray-200 bg-gray-50'
        }`}>
          {noteText ? (
            <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
              {noteText}
            </div>
          ) : (
            <div className="text-sm text-gray-500 dark:text-gray-400 italic">
              No notes yet. Click Edit to add your observations about this enhanced chart analysis.
            </div>
          )}
        </div>
      )}
      
      <div className="flex items-center space-x-4 text-xs text-gray-500 dark:text-gray-400">
        <button className="flex items-center space-x-1 hover:text-gray-700 dark:hover:text-gray-300">
          <Mic className="w-3 h-3" />
          <span>Voice Note</span>
        </button>
        <button className="flex items-center space-x-1 hover:text-gray-700 dark:hover:text-gray-300">
          <Video className="w-3 h-3" />
          <span>Video Link</span>
        </button>
        <button className="flex items-center space-x-1 hover:text-gray-700 dark:hover:text-gray-300">
          <Link className="w-3 h-3" />
          <span>External Link</span>
        </button>
      </div>
    </div>
  );
};

// Timeline Component (Preserved with minor enhancements)
const Timeline = ({ charts, setCurrentChart, setCurrentView, darkMode, licenseActive=false }) => {
  const [selectedTag, setSelectedTag] = useState('all');

  const cardBg = darkMode 
    ? 'bg-gray-800/60 backdrop-blur-xl border-gray-700' 
    : 'bg-white/60 backdrop-blur-xl border-white/80';

  // Get all unique tags
  const allTags = useMemo(() => {
    const tagSet = new Set(['all']);
    charts.forEach(chart => {
      chart.tags?.forEach(tag => tagSet.add(tag));
    });
    return Array.from(tagSet);
  }, [charts]);

  // Filter charts by tag
  const filteredCharts = useMemo(() => {
    let filtered = charts;
    
    if (selectedTag !== 'all') {
      filtered = filtered.filter(chart => chart.tags?.includes(selectedTag));
    }
    
    return filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [charts, selectedTag]);

  // Group charts by date
  const groupedCharts = useMemo(() => {
    const groups = {};
    filteredCharts.forEach(chart => {
      const date = new Date(chart.timestamp).toDateString();
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(chart);
    });
    return groups;
  }, [filteredCharts]);

  const getOutcomeEmoji = (judgment) => {
    switch (judgment) {
      case 'YES': return '✅';
      case 'NO': return '❌';
      default: return '❓';
    }
  };

  const getTagColor = (tag) => {
    const colors = {
      'career': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      'relationship': 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
      'finance': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      'health': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      'travel': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
      'family': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
      'property': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
      'education': 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
      'gambling': 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
      'default': 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
    };
    return colors[tag] || colors.default;
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h2 className="text-3xl font-bold mb-2">Timeline View</h2>
        <p className="text-gray-600 dark:text-gray-300">
          Track patterns and outcomes across your enhanced horary practice.
        </p>
      </div>

      {/* Filters */}
      <div className={`${cardBg} border rounded-2xl p-6 mb-8`}>
        <div className="flex flex-wrap gap-4 items-center justify-between">
          <div className="flex flex-wrap gap-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 mr-2">Tags:</span>
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => setSelectedTag(tag)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  selectedTag === tag
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {tag === 'all' ? 'All' : tag.charAt(0).toUpperCase() + tag.slice(1)}
              </button>
            ))}
          </div>
          
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600 dark:text-gray-300">
              {filteredCharts.length} charts
            </span>
          </div>
        </div>
      </div>

      {/* Timeline */}
      {Object.keys(groupedCharts).length > 0 ? (
        <div className="space-y-8">
          {Object.entries(groupedCharts).map(([date, dayCharts]) => (
            <div key={date} className="relative">
              {/* Date Header */}
              <div className="sticky top-20 z-10 mb-4">
                <div className={`inline-block px-4 py-2 rounded-xl text-sm font-medium ${cardBg} border`}>
                  {new Date(date).toLocaleDateString('en-US', { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  })}
                </div>
              </div>

              {/* Charts for this date */}
              <div className="space-y-4 pl-8 border-l-2 border-gray-200 dark:border-gray-600 relative">
                {dayCharts.map((chart, index) => (
                  <div key={chart.id} className="relative">
                    {/* Timeline dot with enhanced styling */}
                    <div className={`absolute -left-10 top-4 w-4 h-4 rounded-full border-2 ${
                      chart.judgment === 'YES' ? 'bg-emerald-500 border-emerald-300' :
                      chart.judgment === 'NO' ? 'bg-red-500 border-red-300' :
                      'bg-amber-500 border-amber-300'
                    } ${chart.enhanced ? 'ring-2 ring-indigo-300 ring-opacity-50' : ''}`}></div>

                    {/* Chart Card */}
                    <div 
                      className={`${cardBg} border rounded-xl p-4 hover:scale-[1.01] transition-all duration-200 cursor-pointer`}
                      onClick={() => {
                        setCurrentChart(chart);
                        setCurrentView('chart-view');
                      }}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center space-x-3">
                          <span className="text-2xl">{getOutcomeEmoji(chart.judgment)}</span>
                          <div>
                            <h3 className="font-medium line-clamp-1 flex items-center">
                              {chart.question}
                              {chart.enhanced && (
                                <Sparkles className="w-3 h-3 ml-2 text-indigo-500" />
                              )}
                            </h3>
                            <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-300">
                              <span>{new Date(chart.timestamp).toLocaleTimeString('en-US', {
                                hour: '2-digit',
                                minute: '2-digit'
                              })}</span>
                              {chart.enhanced && (
                                <span className="px-2 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 rounded text-xs">
                                  Enhanced
                                </span>
                              )}
                              {chart.demo && (
                                <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded text-xs">
                                  Demo
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            chart.judgment === 'YES' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                            chart.judgment === 'NO' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                            'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                          }`}>
                            {licenseActive ? chart.judgment : 'Locked'}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {licenseActive ? `${chart.confidence}%` : ''}
                          </span>
                        </div>
                      </div>

                      {/* Tags */}
                      {chart.tags && chart.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {chart.tags.map(tag => (
                            <span key={tag} className={`px-2 py-1 rounded text-xs ${getTagColor(tag)}`}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <History className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No charts in timeline</h3>
          <p className="text-gray-600 dark:text-gray-300">
            Cast some enhanced charts to see your horary timeline develop.
          </p>
        </div>
      )}

      {/* Enhanced Pattern Analysis */}
      {filteredCharts.length > 0 && (
        <div className={`${cardBg} border rounded-2xl p-6 mt-8`}>
          <h3 className="text-lg font-semibold mb-4">
            Pattern Analysis
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {Math.round((filteredCharts.filter(c => c.judgment === 'YES').length / filteredCharts.length) * 100)}%
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-300">Positive Outcomes</div>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {Math.round(filteredCharts.reduce((sum, c) => sum + (c.confidence || 0), 0) / filteredCharts.length)}%
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-300">Avg Confidence</div>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                {filteredCharts.filter(c => c.solar_factors?.significant).length}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-300">Solar Conditions</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// NotebookView Component (Preserved)
const NotebookView = ({ charts, notes, setNotes, darkMode, setCurrentChart, setCurrentView, licenseActive=false }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedChart, setSelectedChart] = useState(null);
  const [currentNote, setCurrentNote] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  const cardBg = darkMode 
    ? 'bg-gray-800/60 backdrop-blur-xl border-gray-700' 
    : 'bg-white/60 backdrop-blur-xl border-white/80';

  const chartsWithNotes = useMemo(() => {
    return charts.filter(chart => notes[chart.id] && notes[chart.id].trim().length > 0);
  }, [charts, notes]);

  const filteredCharts = useMemo(() => {
    if (!searchTerm) return chartsWithNotes;
    
    return chartsWithNotes.filter(chart => 
      chart.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
      notes[chart.id]?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [chartsWithNotes, searchTerm, notes]);

  useEffect(() => {
    if (selectedChart) {
      setCurrentNote(notes[selectedChart.id] || '');
    }
  }, [selectedChart, notes]);

  const handleSaveNote = () => {
    if (selectedChart) {
      setNotes(selectedChart.id, currentNote);
      setIsEditing(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h2 className="text-3xl font-bold mb-2">Notebook</h2>
        <p className="text-gray-600 dark:text-gray-300">
          Manage notes, observations, and follow-ups for your enhanced horary charts.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Notes List - Left Panel */}
        <div className="lg:col-span-1">
          <div className={`${cardBg} border rounded-2xl p-6`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Notes ({chartsWithNotes.length})</h3>
            </div>

            {/* Search */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search notes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`w-full pl-10 pr-4 py-2 rounded-lg border transition-all duration-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                  darkMode 
                    ? 'bg-gray-700/50 border-gray-600 text-white placeholder-gray-400' 
                    : 'bg-white/70 border-gray-200 text-gray-900 placeholder-gray-500'
                }`}
              />
            </div>

            {/* Notes List */}
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {filteredCharts.map(chart => (
                <button
                  key={chart.id}
                  onClick={() => {
                    setSelectedChart(chart);
                    setIsEditing(false);
                  }}
                  className={`w-full text-left p-3 rounded-lg transition-all duration-200 ${
                    selectedChart?.id === chart.id
                      ? 'bg-indigo-100 dark:bg-indigo-900/30 border-indigo-300 dark:border-indigo-600'
                      : 'bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700'
                  } border`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="font-medium text-sm line-clamp-1">
                      {chart.question}
                    </div>
                    {chart.enhanced && (
                      <Sparkles className="w-3 h-3 text-indigo-500 flex-shrink-0" />
                    )}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-300 mb-2">
                    {new Date(chart.timestamp).toLocaleDateString()}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                    {notes[chart.id]?.substring(0, 100)}...
                  </div>
                </button>
              ))}
              
              {filteredCharts.length === 0 && (
                <div className="text-center py-6 text-gray-500 dark:text-gray-400">
                  {chartsWithNotes.length === 0 ? 'No notes yet' : 'No matching notes'}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Note Editor - Right Panel */}
        <div className="lg:col-span-2">
          <div className={`${cardBg} border rounded-2xl p-6`}>
            {selectedChart ? (
              <>
                {/* Chart Header */}
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-lg font-semibold line-clamp-1 flex items-center">
                      {selectedChart.question}
                      {selectedChart.enhanced && (
                        <Sparkles className="w-4 h-4 ml-2 text-indigo-500" />
                      )}
                    </h3>
                    <div className="text-sm text-gray-600 dark:text-gray-300">
                      {new Date(selectedChart.timestamp).toLocaleDateString()} • {licenseActive ? selectedChart.judgment : 'Locked'} {licenseActive ? `(${selectedChart.confidence}%)` : ''}
                      {selectedChart.enhanced && ' • Enhanced Analysis'}
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => {
                        setCurrentChart(selectedChart);
                        setCurrentView('chart-view');
                      }}
                      className="flex items-center space-x-1 px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>View Chart</span>
                    </button>
                    
                    {!isEditing ? (
                      <button
                        onClick={() => setIsEditing(true)}
                        className="flex items-center space-x-1 px-3 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 rounded text-sm hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-colors"
                      >
                        <Edit3 className="w-4 h-4" />
                        <span>Edit</span>
                      </button>
                    ) : (
                      <div className="flex space-x-2">
                        <button
                          onClick={handleSaveNote}
                          className="flex items-center space-x-1 px-3 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded text-sm hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-colors"
                        >
                          <Save className="w-4 h-4" />
                          <span>Save</span>
                        </button>
                        <button
                          onClick={() => {
                            setIsEditing(false);
                            setCurrentNote(notes[selectedChart.id] || '');
                          }}
                          className="flex items-center space-x-1 px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                        >
                          <X className="w-4 h-4" />
                          <span>Cancel</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Note Editor */}
                {isEditing ? (
                  <div className="space-y-4">
                    <textarea
                      value={currentNote}
                      onChange={(e) => setCurrentNote(e.target.value)}
                      placeholder="Write your notes about this enhanced chart... (Markdown supported)"
                      className={`w-full h-80 p-4 rounded-lg border transition-all duration-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none ${
                        darkMode 
                          ? 'bg-gray-700/50 border-gray-600 text-white placeholder-gray-400' 
                          : 'bg-white/70 border-gray-200 text-gray-900 placeholder-gray-500'
                      }`}
                    />
                    
                    {/* Markdown toolbar */}
                    <div className="flex items-center space-x-4 text-xs text-gray-500 dark:text-gray-400">
                      <span>Markdown supported:</span>
                      <span>**bold**</span>
                      <span>*italic*</span>
                      <span># heading</span>
                      <span>- list</span>
                      <span>[link](url)</span>
                    </div>
                  </div>
                ) : (
                  <div className={`min-h-80 p-4 rounded-lg border ${
                    darkMode ? 'border-gray-600 bg-gray-700/30' : 'border-gray-200 bg-gray-50'
                  }`}>
                    {currentNote ? (
                      <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                        {currentNote}
                      </div>
                    ) : (
                      <div className="text-sm text-gray-500 dark:text-gray-400 italic">
                        No notes for this enhanced chart yet. Click Edit to add your observations.
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-20">
                <BookOpen className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  Select a chart to view its notes
                </h3>
                <p className="text-gray-600 dark:text-gray-300">
                  Choose an enhanced chart from the list to view and edit its notes.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Enhanced Settings Component
const Settings = ({ darkMode, toggleDarkMode, setCurrentView, apiStatus, onRefreshApi, onLicenseChanged }) => {
  const [apiVersion, setApiVersion] = useState(null);
  const [loading, setLoading] = useState(false);
  // Licensing state
  const [license, setLicense] = useState({ active: false });
  const [licenseKey, setLicenseKey] = useState('');
  const [licenseEmail, setLicenseEmail] = useState('');
  const [licMsg, setLicMsg] = useState('');
  // Updates
  const [updMsg, setUpdMsg] = useState('');
  const [updReady, setUpdReady] = useState(false);

  const cardBg = darkMode 
    ? 'bg-gray-800/60 backdrop-blur-xl border-gray-700' 
    : 'bg-white/60 backdrop-blur-xl border-white/80';

  useEffect(() => {
    if (apiStatus === 'connected') {
      fetchApiVersion();
    }
    // Load license status and wire update events once when settings opens
    try {
      if (window.electronAPI?.getLicenseStatus) {
        window.electronAPI.getLicenseStatus().then((s)=> { if (s) { setLicense(s); onLicenseChanged && onLicenseChanged(s); } });
      }
      if (window.electronAPI?.onUpdateAvailable) {
        window.electronAPI.onUpdateAvailable((info)=> setUpdMsg(`Update available${info?.version? ' '+info.version:''}`));
        window.electronAPI.onUpdateNotAvailable(()=> setUpdMsg('No updates found'));
        window.electronAPI.onUpdateError((e)=> setUpdMsg(`Update error: ${e}`));
        window.electronAPI.onUpdateProgress((p)=> setUpdMsg(`Downloading: ${Math.round(p?.percent||0)}%`));
        window.electronAPI.onUpdateDownloaded(()=> { setUpdMsg('Update ready'); setUpdReady(true); });
      }
    } catch (_) {}
  }, [apiStatus]);

  const fetchApiVersion = async () => {
    try {
      const version = await VoxStellaAPI.getVersion();
      setApiVersion(version);
    } catch (error) {
      console.error('Failed to fetch API version:', error);
    }
  };

  const handleActivate = async () => {
    setLicMsg('Activating...');
    try {
      const res = await window.electronAPI?.activateLicense?.({ key: licenseKey.trim(), email: licenseEmail.trim() });
      if (res?.ok) { setLicense(res.status); onLicenseChanged && onLicenseChanged(res.status); setLicMsg('Activated'); }
      else { setLicMsg(res?.error || 'Activation failed'); }
    } catch (e) { setLicMsg(String(e)); }
  };

  const handleDeactivate = async () => {
    try { await window.electronAPI?.deactivateLicense?.(); } catch(_){}
    const status = await window.electronAPI?.getLicenseStatus?.();
    setLicense(status || { active:false });
    if (status) onLicenseChanged && onLicenseChanged(status);
    setLicMsg('Deactivated');
  };

  const checkUpdates = async () => {
    setUpdMsg('Checking for updates...');
    try { await window.electronAPI?.checkForUpdates?.(); } catch(_){}
  };

  const restartToUpdate = async () => {
    try { await window.electronAPI?.restartToUpdate?.(); } catch(_){}
  };

  const testApiConnection = async () => {
    setLoading(true);
    try {
      await VoxStellaAPI.getHealth();
      onRefreshApi();
    } catch (error) {
      console.error('API test failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const settingsOptions = [
    {
      title: "Appearance",
      items: [
        {
          name: "Dark Mode",
          description: "Toggle between light and dark themes",
          type: "toggle",
          value: darkMode,
          onChange: toggleDarkMode
        },
        {
          name: "Theme Color",
          description: "Choose your preferred accent color",
          type: "select",
          options: ["Teal", "Purple", "Blue", "Green"],
          value: "Teal"
        }
      ]
    },
    {
      title: "Enhanced Chart Preferences",
      items: [
        {
          name: "House System",
          description: "Default house system for enhanced calculations",
          type: "select",
          options: ["Regiomontanus", "Placidus", "Whole Sign", "Equal"],
          value: "Regiomontanus"
        },
        {
          name: "Enhanced Orb Settings",
          description: "Default orb allowances for traditional aspects",
          type: "slider",
          value: 8,
          min: 1,
          max: 15
        },
        {
          name: "Reception Weighting",
          description: "Enhanced exaltation confidence boost",
          type: "slider",
          value: 15,
          min: 0,
          max: 30
        }
      ]
    },
    {
      title: "Enhanced Features",
      items: [
        {
          name: "Future Retrograde Protection",
          description: "Enable enhanced retrograde frustration checks",
          type: "toggle",
          value: true
        },
        {
          name: "Enhanced Solar Conditions",
          description: "Use visibility-based combustion exceptions",
          type: "toggle",
          value: true
        },
        {
          name: "Directional Motion Awareness",
          description: "Consider planetary direction for sign boundaries",
          type: "toggle",
          value: true
        }
      ]
    },
    {
      title: "Advanced Horary Configuration",
      description: "Customize traditional horary rules and weights",
      items: [
        {
          name: "Aspect Orbs",
          description: "Traditional aspect orbs (degrees)",
          type: "group",
          items: [
            { name: "Conjunction", type: "slider", value: 8.0, min: 1, max: 15, step: 0.5 },
            { name: "Sextile", type: "slider", value: 6.0, min: 1, max: 12, step: 0.5 },
            { name: "Square", type: "slider", value: 8.0, min: 1, max: 15, step: 0.5 },
            { name: "Trine", type: "slider", value: 8.0, min: 1, max: 15, step: 0.5 },
            { name: "Opposition", type: "slider", value: 8.0, min: 1, max: 15, step: 0.5 }
          ]
        },
        {
          name: "Confidence Levels",
          description: "Base confidence for different perfection types",
          type: "group",
          items: [
            { name: "Direct (Mutual Rulership)", type: "slider", value: 95, min: 50, max: 100, step: 1 },
            { name: "Direct (Mutual Exaltation)", type: "slider", value: 85, min: 50, max: 100, step: 1 },
            { name: "Translation of Light", type: "slider", value: 75, min: 50, max: 95, step: 1 },
            { name: "Collection of Light", type: "slider", value: 70, min: 50, max: 95, step: 1 },
            { name: "Reception Only", type: "slider", value: 65, min: 30, max: 90, step: 1 }
          ]
        },
        {
          name: "Solar Conditions",
          description: "Cazimi and combustion parameters",
          type: "group",
          items: [
            { name: "Cazimi Orb (arcminutes)", type: "slider", value: 17, min: 10, max: 30, step: 1 },
            { name: "Combustion Orb (degrees)", type: "slider", value: 8.5, min: 6, max: 12, step: 0.5 },
            { name: "Under Beams Orb (degrees)", type: "slider", value: 15.0, min: 10, max: 20, step: 0.5 },
            { name: "Cazimi Bonus", type: "slider", value: 15, min: 5, max: 25, step: 1 },
            { name: "Combustion Penalty", type: "slider", value: 10, min: 5, max: 20, step: 1 }
          ]
        },
        {
          name: "Moon Settings",
          description: "Void-of-course and lunar testimony",
          type: "group",
          items: [
            { name: "Void Penalty", type: "slider", value: 10, min: 0, max: 30, step: 1 },
            { name: "Moon in Cancer Exception", type: "toggle", value: true },
            { name: "Moon in Sagittarius Exception", type: "toggle", value: true }
          ]
        },
        {
          name: "Radicality Checks",
          description: "Chart validity parameters",
          type: "group",
          items: [
            { name: "Early Ascendant (degrees)", type: "slider", value: 3.0, min: 1, max: 10, step: 0.5 },
            { name: "Late Ascendant (degrees)", type: "slider", value: 27.0, min: 20, max: 30, step: 0.5 },
            { name: "Check Saturn in 7th", type: "toggle", value: true },
            { name: "Check Via Combusta", type: "toggle", value: true },
            { name: "Radicality Warning Penalty", type: "slider", value: 15, min: 0, max: 30, step: 1 }
          ]
        },
        {
          name: "Dignity Weights",
          description: "Traditional dignity scoring",
          type: "group",
          items: [
            { name: "Rulership", type: "slider", value: 5, min: 1, max: 10, step: 1 },
            { name: "Exaltation", type: "slider", value: 4, min: 1, max: 8, step: 1 },
            { name: "Triplicity", type: "slider", value: 3, min: 1, max: 6, step: 1 },
            { name: "Detriment", type: "slider", value: -5, min: -10, max: -1, step: 1 },
            { name: "Fall", type: "slider", value: -4, min: -8, max: -1, step: 1 },
            { name: "Joy", type: "slider", value: 2, min: 1, max: 5, step: 1 }
          ]
        }
      ]
    }
  ];

  // Rename and filter settings sections per request
  const settingsSections = settingsOptions
    .map(section => {
      if (section.title === 'Enhanced Chart Preferences') {
        return {
          ...section,
          title: 'Chart Preferences',
          items: (section.items || [])
            .map(item => {
              if (item.name === 'Enhanced Orb Settings') {
                return { ...item, name: 'Orb Settings', description: 'Default aspect orb (degrees)' };
              }
              if (item.name === 'Reception Weighting') {
                return { ...item, name: 'Exaltation Boost', description: 'Exaltation confidence boost' };
              }
              if (item.description === 'Default house system for enhanced calculations') {
                return { ...item, description: 'Default house system' };
              }
              return item;
            })
            // Keep only House System per request
            .filter(item => item.name === 'House System')
        };
      }
      return section;
    })
    .filter(section => !['Enhanced Features', 'Advanced Horary Configuration'].includes(section.title));

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <button 
          onClick={() => setCurrentView('dashboard')}
          className="flex items-center text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </button>
        <h2 className="text-3xl font-bold mb-2 flex items-center">Settings</h2>
        <p className="text-gray-600 dark:text-gray-300">Customize your Vox Stella experience.</p>
      </div>

      {/* API Status */}
      <div className={`${cardBg} border rounded-2xl p-6 mb-8`}>
        <h3 className="text-lg font-semibold mb-4 flex items-center">
          <Globe className="w-5 h-5 mr-2" />
          API Connection
        </h3>
        
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className={`w-3 h-3 rounded-full ${
              apiStatus === 'connected' ? 'bg-emerald-500' : 
              apiStatus === 'offline' ? 'bg-red-500' : 'bg-amber-500'
            }`}></div>
            <span className="font-medium">
              {apiStatus === 'connected' ? 'API Connected' : 
               apiStatus === 'offline' ? 'API Offline' : 'Checking...'}
            </span>
            <span className="text-sm text-gray-600 dark:text-gray-300">
              {apiStatus === 'connected' ? 'Horary Engine available' : 'Using demo mode'}
            </span>
          </div>
          
          <button
            onClick={testApiConnection}
            disabled={loading}
            className="flex items-center space-x-2 px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            <span>Test Connection</span>
          </button>
        </div>

        {apiVersion && (
          <div className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
            <div>API Version: {apiVersion.api_version}</div>
            <div>Engine: {apiVersion.engine_version}</div>
            <div>Release Date: {apiVersion.release_date}</div>
            {/* Feature list removed per request */}
          </div>
        )}
      </div>


      <div className="space-y-8">
        {settingsSections.map((section, sectionIndex) => (
          <div key={sectionIndex} className={`${cardBg} border rounded-2xl p-6`}>
            <h3 className="text-lg font-semibold mb-4 flex items-center">
              {section.title}
              {section.title.includes('Enhanced') && (
                <Sparkles className="w-4 h-4 ml-2 text-indigo-500" />
              )}
              {section.title.includes('Advanced') && (
                <Sliders className="w-4 h-4 ml-2 text-amber-500" />
              )}
            </h3>
            {section.description && (
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">{section.description}</p>
            )}
            {section.title.includes('Advanced') && (
              <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
                <div className="flex items-center mb-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 mr-2" />
                  <span className="text-sm font-medium text-amber-800 dark:text-amber-200">Advanced Configuration</span>
                </div>
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  These settings modify traditional horary calculation rules. Changes are saved automatically and affect all new charts.
                  Use "Reset to Defaults" to restore classical values from Lilly, Bonatti, and other traditional sources.
                </p>
                <div className="flex space-x-2 mt-3">
                  <button className="px-3 py-1 text-xs bg-amber-100 hover:bg-amber-200 dark:bg-amber-800 dark:hover:bg-amber-700 text-amber-800 dark:text-amber-200 rounded border border-amber-300 dark:border-amber-600 transition-colors">
                    Reset to Defaults
                  </button>
                  <button className="px-3 py-1 text-xs bg-blue-100 hover:bg-blue-200 dark:bg-blue-800 dark:hover:bg-blue-700 text-blue-800 dark:text-blue-200 rounded border border-blue-300 dark:border-blue-600 transition-colors">
                    Export Settings
                  </button>
                </div>
              </div>
            )}
            <div className="space-y-4">
              {section.items.map((item, itemIndex) => (
                <div key={itemIndex} className={`py-3 border-b border-gray-200 dark:border-gray-600 last:border-b-0 ${
                  item.type === 'group' ? 'block' : 'flex justify-between items-center'
                }`}>
                  <div className="flex-1">
                    <h4 className="font-medium">{item.name}</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-300">{item.description}</p>
                  </div>
                  
                  {item.type !== 'group' && (
                    <div className="ml-4">
                      {item.type === 'toggle' && (
                        <button
                          onClick={item.onChange}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            item.value ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              item.value ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      )}
                      {item.type === 'select' && (
                        <select 
                          defaultValue={item.value}
                          className={`px-3 py-2 rounded-lg border transition-all duration-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                            darkMode 
                              ? 'bg-gray-700/50 border-gray-600 text-white' 
                              : 'bg-white/70 border-gray-200 text-gray-900'
                          }`}
                        >
                          {item.options?.map((option, optIndex) => (
                            <option key={optIndex} value={option}>{option}</option>
                          ))}
                        </select>
                      )}
                      {item.type === 'slider' && (
                        <div className="flex items-center space-x-3">
                          <input
                            type="range"
                            min={item.min || 1}
                            max={item.max || 15}
                            step={item.step || 1}
                            defaultValue={item.value}
                            className="w-20 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                          />
                          <span className="text-sm text-gray-600 dark:text-gray-300 min-w-8">
                            {item.value}{item.max > 20 ? '%' : '°'}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {item.type === 'group' && (
                    <div className="mt-4 space-y-3">
                      {item.items?.map((subItem, subIndex) => (
                        <div key={subIndex} className="flex justify-between items-center py-2 px-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                          <div className="flex-1">
                            <span className="text-sm font-medium">{subItem.name}</span>
                          </div>
                          <div className="ml-4">
                            {subItem.type === 'slider' && (
                              <div className="flex items-center space-x-3">
                                <input
                                  type="range"
                                  min={subItem.min}
                                  max={subItem.max}
                                  step={subItem.step || 1}
                                  defaultValue={subItem.value}
                                  className="w-16 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                                  onChange={(e) => {
                                    // Update the display value
                                    const valueSpan = e.target.nextElementSibling;
                                    if (valueSpan) {
                                      valueSpan.textContent = e.target.value + (subItem.max > 50 ? '' : subItem.name.includes('arcminutes') ? '"' : '°');
                                    }
                                  }}
                                />
                                <span className="text-xs text-gray-600 dark:text-gray-300 min-w-8">
                                  {subItem.value}{subItem.max > 50 ? '' : subItem.name.includes('arcminutes') ? '"' : '°'}
                                </span>
                              </div>
                            )}
                            {subItem.type === 'toggle' && (
                              <button
                                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                                  subItem.value ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'
                                }`}
                              >
                                <span
                                  className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                                    subItem.value ? 'translate-x-5' : 'translate-x-1'
                                  }`}
                                />
                              </button>
                            )}
                            {subItem.type === 'select' && (
                              <select 
                                defaultValue={subItem.value}
                                className={`px-2 py-1 text-sm rounded border transition-all duration-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                                  darkMode 
                                    ? 'bg-gray-600 border-gray-500 text-white' 
                                    : 'bg-white border-gray-200 text-gray-900'
                                }`}
                              >
                                {subItem.options?.map((option, optIndex) => (
                                  <option key={optIndex} value={option}>{option}</option>
                                ))}
                              </select>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* License Section */}
        <div className={`${cardBg} border rounded-2xl p-6`}>
          <h3 className="text-lg font-semibold mb-4 flex items-center">
            License and Activation
            <Shield className="w-4 h-4 ml-2 text-indigo-500" />
          </h3>
          {license.active ? (
            <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
              <div className="flex justify-between"><span>Status</span><span className="text-emerald-500">Active</span></div>
              <div className="flex justify-between"><span>Plan</span><span>{license.plan || 'standard'}</span></div>
              {license.exp && (
                <div className="flex justify-between"><span>Expires</span><span>{new Date((license.exp||0)*1000).toLocaleDateString()}</span></div>
              )}
              {license.deviceId && (
                <div className="flex justify-between"><span>Device</span><span className="truncate max-w-xs">{license.deviceId}</span></div>
              )}
              <div className="pt-3">
                <button onClick={handleDeactivate} className="px-3 py-1.5 text-sm rounded bg-red-600 text-white hover:bg-red-700">Deactivate this device</button>
                {licMsg && <span className="ml-3 text-xs text-gray-500">{licMsg}</span>}
              </div>
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <div>
                <label className="block mb-1">License Key</label>
                <input value={licenseKey} onChange={(e)=>setLicenseKey(e.target.value)} className={`w-full px-3 py-2 rounded border ${darkMode? 'bg-gray-700 border-gray-600 text-white':'bg-white border-gray-300'}`} placeholder="XXXX-XXXX-XXXX-XXXX" />
              </div>
              <div>
                <label className="block mb-1">Email (optional)</label>
                <input value={licenseEmail} onChange={(e)=>setLicenseEmail(e.target.value)} className={`w-full px-3 py-2 rounded border ${darkMode? 'bg-gray-700 border-gray-600 text-white':'bg-white border-gray-300'}`} placeholder="name@example.com" />
              </div>
              <div className="pt-2 flex items-center space-x-2">
                <button onClick={handleActivate} className="px-3 py-1.5 text-sm rounded bg-indigo-600 text-white hover:bg-indigo-700">Activate</button>
                <button onClick={() => window.open('https://example.com/vox-stella/purchase', '_blank')} className="px-3 py-1.5 text-sm rounded bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600">Purchase License</button>
                {licMsg && <span className="ml-2 text-xs text-gray-500">{licMsg}</span>}
              </div>
            </div>
          )}
        </div>

        {/* Updates Section */}
        <div className={`${cardBg} border rounded-2xl p-6`}>
          <h3 className="text-lg font-semibold mb-4 flex items-center">
            Updates
            <RefreshCw className="w-4 h-4 ml-2 text-indigo-500" />
          </h3>
          <div className="flex items-center space-x-3 text-sm">
            <button onClick={checkUpdates} className="px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700">Check for updates</button>
            {updReady && <button onClick={restartToUpdate} className="px-3 py-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-700">Restart to update</button>}
            <span className="text-gray-600 dark:text-gray-300">{updMsg}</span>
          </div>
        </div>

        {/* Enhanced About Section */}
        <div className={`${cardBg} border rounded-2xl p-6`}>
          <h3 className="text-lg font-semibold mb-4 flex items-center">
            About Enhanced Vox Stella
            <Sparkles className="w-4 h-4 ml-2 text-indigo-500" />
          </h3>
          <div className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
            <div className="flex justify-between">
              <span>App Version</span>
              <span>2.0.0 Enhanced</span>
            </div>
            <div className="flex justify-between">
              <span>Engine</span>
              <span>Enhanced Traditional Horary with Solar Conditions v2.0</span>
            </div>
            <div className="flex justify-between">
              <span>Ephemeris</span>
              <span>Swiss Ephemeris with Enhanced Calculations</span>
            </div>
            <div className="flex justify-between">
              <span>House System</span>
              <span>Regiomontanus (Traditional with Enhanced Motion Awareness)</span>
            </div>
            <div className="flex justify-between">
              <span>Enhanced Features</span>
              <span>9 Advanced Traditional Enhancements</span>
            </div>
            <div className="flex justify-between">
              <span>Classical Sources</span>
              <span>Lilly, Bonatti, Ptolemy, Firmicus, Al-Biruni</span>
            </div>
          </div>
          
          <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-600">
            <button className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 text-sm flex items-center">
              <ExternalLink className="w-4 h-4 mr-2" />
              View Enhanced Documentation
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Footer Component (Preserved)
const Footer = ({ darkMode, currentView, setCurrentView }) => {
  const footerBg = darkMode 
    ? 'bg-gray-800/90 backdrop-blur-xl border-gray-700' 
    : 'bg-white/90 backdrop-blur-xl border-gray-200';

  return (
    <footer className={`fixed bottom-0 left-0 right-0 ${footerBg} border-t md:hidden`}>
      <div className="flex justify-around items-center py-2">
        <FooterButton 
          icon={BarChart3} 
          label="Dashboard" 
          active={currentView === 'dashboard'}
          onClick={() => setCurrentView('dashboard')}
        />
        <FooterButton 
          icon={Plus} 
          label="Cast" 
          active={currentView === 'cast-chart'}
          onClick={() => setCurrentView('cast-chart')}
        />
        <FooterButton 
          icon={History} 
          label="Timeline" 
          active={currentView === 'timeline'}
          onClick={() => setCurrentView('timeline')}
        />
        <FooterButton 
          icon={BookOpen} 
          label="Notes" 
          active={currentView === 'notebook'}
          onClick={() => setCurrentView('notebook')}
        />
        <FooterButton 
          icon={SettingsIcon} 
          label="Settings" 
          active={currentView === 'settings'}
          onClick={() => setCurrentView('settings')}
        />
      </div>
    </footer>
  );
};

// Footer Button Component (Enhanced)
const FooterButton = ({ icon: Icon, label, active, onClick, customIcon }) => {
  const activeClasses = active 
    ? 'text-indigo-600 dark:text-indigo-400' 
    : 'text-gray-600 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400';

  return (
    <button 
      onClick={onClick}
      className={`flex flex-col items-center py-2 px-3 transition-colors ${activeClasses}`}
    >
      {customIcon ? customIcon : <Icon className="w-5 h-5 mb-1" />}
      <span className="text-xs">{label}</span>
    </button>
  );
};

export default VoxStellaApp;
