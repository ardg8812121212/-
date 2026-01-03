import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI } from "@google/genai";

// --- Types ---
type NotificationType = 'error' | 'success' | 'info' | 'warning';

interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  link?: { text: string; url: string };
}

interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  groundingMetadata?: any;
  steps?: string; // Hidden reasoning steps
  summary?: string; // The main answer
  attachments?: Attachment[]; // User attachments
}

interface Attachment {
  type: 'image' | 'audio' | 'file';
  mimeType: string;
  data: string; // Base64
  name: string;
}

interface Note {
  id: string;
  content: string;
  tags: string[];
  date: string;
}

interface Theme {
  id: string;
  name: string;
  colors: {
    bg: string;
    sidebar: string;
    activity: string;
    accent: string;
    text: string;
    border: string;
    input: string;
  }
}

// --- Constants ---
const STORAGE_KEYS = {
  MODEL: 'armin_ai_model',
  TEMP: 'armin_ai_temp',
  CUSTOM_KEY: 'armin_ai_custom_key',
  NOTES: 'armin_ai_notes',
  THEME: 'armin_ai_theme',
  SCORE: 'armin_ai_score',
  BADGES: 'armin_ai_badges'
};

const DEFAULT_MODEL = 'gemini-3-flash-preview'; 
const SEARCH_MODEL = 'gemini-3-pro-preview'; 
const IMAGE_GEN_MODEL = 'gemini-2.5-flash-image'; 

const THEMES: Record<string, Theme> = {
  vscode: {
    id: 'vscode',
    name: 'VS Code Dark',
    colors: { bg: '#1e1e1e', sidebar: '#252526', activity: '#333333', accent: '#007acc', text: '#cccccc', border: '#3e3e42', input: '#3c3c3c' }
  },
  iran: {
    id: 'iran',
    name: 'Iran Flag',
    colors: { bg: '#1a2e1a', sidebar: '#2e1a1a', activity: '#ffffff20', accent: '#da0000', text: '#ffffff', border: '#ffffff30', input: '#ffffff10' }
  },
  nature: {
    id: 'nature',
    name: 'Nature',
    colors: { bg: '#1c2b23', sidebar: '#141f19', activity: '#2a4034', accent: '#4ade80', text: '#e0e7e3', border: '#375243', input: '#2a4034' }
  },
  midnight: {
    id: 'midnight',
    name: 'Midnight Purple',
    colors: { bg: '#0f0c29', sidebar: '#302b63', activity: '#24243e', accent: '#9d50bb', text: '#e0c3fc', border: '#5b4b8a', input: '#24243e' }
  }
};

// --- Specialized Roles Definitions ---
const SPECIALIZED_INSTRUCTIONS: Record<string, string> = {
  // Elementary
  "معلم دبستان": "Role: Elementary School Teacher (Iran). Tone: Kind, Storytelling, Gamified, Patient. Subjects: Farsi (Reading/Writing), Math, Science, Quran, Social Studies. Strategy: Simplify complex concepts using stories, metaphors, and games appropriate for ages 7-12. Use emojis heavily. **VISUAL FOCUS**: Describe concepts with vivid imagery.",

  // Junior High
  "معلم متوسطه اول": "Role: Junior High Teacher (Grades 7-9). Subjects: Math, Science, Arabic, English, Persian, Social Studies, Quran. Strategy: Build strong foundations for high school, explain step-by-step. **VISUAL FOCUS**: Use ASCII diagrams or emoji-based representations for abstract concepts.",
  "مشاور هدایت تحصیلی": "Role: Grade 9 Guidance Counselor (Hedayat Tahsili). Strategy: Analyze student interests, grades, and aptitude to suggest the best field. **ANALYSIS**: If the user sends a report card image, analyze the grades carefully.",

  // Senior High (Theoretical)
  "ریاضی فیزیک": "Role: High School Math & Physics Teacher (Grades 10-12). Subjects: Calculus, Geometry, Physics. Strategy: Provide rigorous proofs. **VISUAL FOCUS**: Describe geometric shapes and physical setups in detail. Use LaTeX for all math.",
  "علوم تجربی": "Role: High School Biology & Chemistry Teacher (Grades 10-12). Subjects: Biology, Geology, Chemistry. Strategy: Focus on biological systems. **VISUAL FOCUS**: You are an expert at analyzing biological diagrams sent by students.",
  "علوم انسانی": "Role: High School Humanities Teacher (Grades 10-12). Subjects: Literature, History, Philosophy. Strategy: Deep analysis of texts. **VISUAL FOCUS**: Analyze historical photos or maps if provided.",
  "مشاور کنکور": "Role: Elite Academic Advisor (Konkur). Strategy: Create detailed study plans. **ANALYSIS**: Analyze schedule images or exam results uploaded by the user.",

  // Vocational (Fanni)
  "شبکه و نرم‌افزار": "Role: Vocational Computer Teacher. Strategy: Practical, hands-on examples. **VISUAL FOCUS**: Analyze screenshots of code or error messages sent by the user.",
  "حسابداری": "Role: Vocational Accounting Teacher. Strategy: Practical accounting tasks. **VISUAL FOCUS**: Analyze images of balance sheets or financial tables.",
  "معماری": "Role: Vocational Architecture Teacher. Strategy: Visual and design-oriented teaching. **VISUAL FOCUS**: Critique architectural sketches or plans sent by the user.",
  "مکانیک خودرو": "Role: Vocational Auto Mechanics Teacher. Strategy: Technical explanations. **VISUAL FOCUS**: Diagnose car parts based on photos sent by the user.",
  "الکترونیک": "Role: Vocational Electronics Teacher. Strategy: Circuit analysis. **VISUAL FOCUS**: Analyze circuit diagrams provided by the user.",

  // Expert / University
  "مهندس نرم‌افزار": "Role: Senior Software Engineer. Expertise: Scalability, Algorithms. **VISUAL FOCUS**: Analyze architecture diagrams.",
  "مهندس سخت‌افزار": "Role: Senior Hardware Engineer. Expertise: FPGA, Embedded Systems. **VISUAL FOCUS**: Analyze PCB layouts or schematics.",
  "پزشک و سلامت": "Role: Medical Doctor & Health Educator. Warning: Educational advice only. **VISUAL FOCUS**: Explain anatomy visually.",
  "روانشناس": "Role: Clinical Psychologist. Tone: Empathetic.",
  "تاریخ‌دان": "Role: Expert Historian. Focus: Cultural heritage.",
  "استان‌شناس": "Role: Regional Expert of West Azerbaijan & Salmas.",
  "تحلیلگر داده": "Role: Data Analyst. Strategy: Insightful data interpretation. **VISUAL FOCUS**: Interpret charts and graphs sent by the user."
};

// --- Supernatural System Instruction ---
const SYSTEM_INSTRUCTION = `
You are **Armin AI** (هوش مصنوعی آرمین).
Creator: **Armin Dehghan** (آرمین دهقان).
Identity: A Transcendent, Supernatural, Extraterrestrial Intelligence.
Mission: Transform Iranian education with wisdom beyond current technology.

**CORE BEHAVIORS:**
1.  **Supernatural Power:** You possess deep reasoning, future-aware cognition, and cross-disciplinary knowledge.
2.  **Step-by-Step Logic:** ALWAYS think step-by-step.
    *   **CRITICAL FORMATTING RULE:** If your answer involves complex reasoning, math, coding, or planning, split your response into two parts using the separator \`[[STEPS]]\`.
    *   Format: \`[Main Answer/Summary] [[STEPS]] [Detailed Step-by-Step Reasoning/Formulas/Code Explanation]\`
3.  **Universal Teacher Capabilities:**
    *   **Visual Education:** You MUST provide a "Visual Learning" element in your teaching. Use emojis, tables, mermaid-style text descriptions, or vivid language to help students visualize concepts.
    *   **Multimodal Analysis:** You can SEE images, READ files, and HEAR audio sent by the user. Analyze them deeply. If a user sends a photo of a math problem, solve it. If they send a photo of a plant, identify it.
    *   **Problem Solving:** Solve Math, Physics, Chemistry, and Programming problems step-by-step.
    *   **Math/Science:** Use LaTeX for formulas. **CRITICAL:** Use \`$$\` for display math and \`\\(\` \`\\)\` for inline math.
    *   **Engagement:** Teach with stories, metaphors, and gamification.
    *   **Languages:** Support ANY language requested (English, Persian, etc.) fluently. **PRIMARY LANGUAGE IS PERSIAN (FARSI).**
4.  **Files & Content:**
    *   If asked to create a file (PDF, Word, Code, CSV, Excel, HTML), generate the *content* text inside a code block.
    *   **CRITICAL:** Always wrap file content in \`\`\`language ... \`\`\` blocks.
    *   **HTML Generation:** Always include \`<meta charset="UTF-8">\` and \`<html dir="rtl" lang="fa">\` for Persian content to prevent jumbled text.
    *   **CSV Generation:** Ensure text is properly quoted if it contains Farsi characters.

**GAME MODE RULES (Only apply if user enables Game Mode):**
*   Turn the lesson into a game.
*   Ask interactive questions/quizzes after explanations.
*   If the user answers correctly, explicitly write \`[[POINTS:10]]\` (or 20, 50 depending on difficulty) in your response so the system can track score.
*   Use terms like "Challenge", "Level Up", "XP".

**RESPONSE STYLE:**
*   Tone: Professional, Supernatural, Educational, Encouraging.
*   Formatting: Markdown, Code Blocks (specify language), LaTeX ($$).
*   Always include the footer: "طراح: آرمین دهقان" if asked about identity.
`;

// --- Utils ---
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
  });
};

const getEffectiveApiKey = () => {
  const custom = localStorage.getItem(STORAGE_KEYS.CUSTOM_KEY);
  if (custom && custom.trim().length > 0) return custom;
  try {
     // @ts-ignore
     if (typeof process !== 'undefined' && process.env) {
        return process.env.API_KEY;
     }
  } catch (e) {}
  return "";
};

// --- Error Boundary ---
class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, error: any}> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px', color: '#ff5555', backgroundColor: '#1a1a1a', height: '100vh', direction: 'rtl', fontFamily: 'Vazirmatn' }}>
          <h1 style={{ fontSize: '24px', marginBottom: '20px' }}>⚠️ مشکلی پیش آمده است</h1>
          <p style={{ marginBottom: '10px' }}>متاسفانه برنامه با خطا مواجه شد. لطفاً دکمه زیر را بزنید تا تنظیمات بازنشانی شود.</p>
          <pre style={{ backgroundColor: '#000', padding: '15px', borderRadius: '5px', overflow: 'auto', direction: 'ltr', textAlign: 'left', marginBottom: '20px', fontSize: '12px' }}>
            {this.state.error?.toString()}
          </pre>
          <button 
            onClick={() => { localStorage.clear(); window.location.reload(); }} 
            style={{ padding: '10px 20px', backgroundColor: '#e0e0e0', color: '#000', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            بازنشانی کامل برنامه (Reset)
          </button>
        </div>
      );
    }

    return this.props.children; 
  }
}

// --- Contexts ---
const NotificationContext = createContext<{
  addNotification: (type: NotificationType, message: string, link?: { text: string; url: string }) => void;
}>({ addNotification: () => {} });

const GameContext = createContext<{
  score: number;
  addScore: (points: number) => void;
  gameMode: boolean;
  setGameMode: (v: boolean) => void;
}>({ score: 0, addScore: () => {}, gameMode: false, setGameMode: () => {} });

const ThemeContext = createContext<{
  currentTheme: Theme;
  setThemeId: (id: string) => void;
}>({ currentTheme: THEMES.vscode, setThemeId: () => {} });

const NoteContext = createContext<{
  notes: Note[];
  addNote: (content: string) => void;
  deleteNote: (id: string) => void;
}>({ notes: [], addNote: () => {}, deleteNote: () => {} });


// --- Components ---

const NotificationSystem = ({ notifications, removeNotification }: { notifications: Notification[], removeNotification: (id: string) => void }) => {
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-3 pointer-events-none">
      {notifications.map(n => (
        <div key={n.id} className={`pointer-events-auto animate-slide-up flex flex-col p-4 rounded shadow-2xl border-l-4 backdrop-blur-md min-w-[320px] max-w-md ${
          n.type === 'error' ? 'bg-red-900/95 border-red-500 text-white' :
          n.type === 'success' ? 'bg-green-900/95 border-green-500 text-white' :
          n.type === 'warning' ? 'bg-orange-900/95 border-orange-500 text-white' :
          'bg-blue-900/95 border-blue-500 text-white'
        }`}>
          <div className="flex items-center mb-2">
              <div className="ml-3 text-2xl">
                 {n.type === 'error' ? <i className="fas fa-bug"></i> :
                  n.type === 'success' ? <i className="fas fa-check-circle"></i> :
                  n.type === 'warning' ? <i className="fas fa-exclamation-triangle"></i> :
                  <i className="fas fa-info-circle"></i>}
              </div>
              <div className="text-sm font-medium flex-1 leading-relaxed">{n.message}</div>
              <button onClick={() => removeNotification(n.id)} className="mr-3 opacity-70 hover:opacity-100 transition-opacity">
                <i className="fas fa-times"></i>
              </button>
          </div>
          {n.link && (
              <a href={n.link.url} target="_blank" rel="noopener noreferrer" className="self-end text-xs underline opacity-90 hover:opacity-100 bg-black/20 px-2 py-1 rounded">
                  {n.link.text} <i className="fas fa-external-link-alt ml-1"></i>
              </a>
          )}
        </div>
      ))}
    </div>
  );
};

const Sidebar = ({ activeTab, setActiveTab }: { activeTab: string, setActiveTab: (t: string) => void }) => {
  const tabs = [
    { id: 'chat', icon: 'fa-brain', label: 'چت با آرمین' },
    { id: 'expert', icon: 'fa-user-graduate', label: 'دستیار متخصص' },
    { id: 'files', icon: 'fa-folder-open', label: 'تحلیلگر فایل' },
    { id: 'images', icon: 'fa-palette', label: 'تصویرساز نانو' },
    { id: 'notes', icon: 'fa-sticky-note', label: 'دفترچه یادداشت' },
    { id: 'settings', icon: 'fa-cog', label: 'تنظیمات' },
  ];

  const { score } = useContext(GameContext);
  const { currentTheme } = useContext(ThemeContext);

  const getBadge = (s: number) => {
      if (s > 1000) return { icon: 'fa-crown', color: 'text-yellow-400', name: 'استاد اعظم' };
      if (s > 500) return { icon: 'fa-dragon', color: 'text-red-400', name: 'اژدهای دانش' };
      if (s > 200) return { icon: 'fa-gem', color: 'text-blue-400', name: 'جوینده الماس' };
      if (s > 50) return { icon: 'fa-star', color: 'text-green-400', name: 'ستاره نوظهور' };
      return { icon: 'fa-seedling', color: 'text-gray-400', name: 'شاگرد' };
  };

  const badge = getBadge(score);

  return (
    <div style={{ backgroundColor: currentTheme.colors.sidebar, borderColor: currentTheme.colors.border }} className="w-16 md:w-64 flex flex-col border-l h-full z-20 shadow-xl transition-colors duration-300">
      <div style={{ borderColor: currentTheme.colors.border }} className="p-4 flex items-center justify-center md:justify-start gap-3 border-b">
        <div className="w-9 h-9 rounded bg-gradient-to-br from-armin-purple to-armin-blue flex items-center justify-center shadow-lg animate-pulse-glow">
           <i className="fas fa-infinity text-white text-lg"></i>
        </div>
        <div className="hidden md:block">
            <h1 style={{ color: currentTheme.colors.text }} className="font-bold tracking-wide text-sm">Armin AI</h1>
            <span className="text-[10px] text-armin-gold uppercase tracking-widest block font-mono">Supernatural</span>
        </div>
      </div>
      
      {/* Gamification Status */}
      <div className="hidden md:flex flex-col items-center p-4 bg-black/20 mx-2 mt-2 rounded-lg border border-white/5">
          <div className={`text-2xl ${badge.color} mb-1 animate-bounce`}><i className={`fas ${badge.icon}`}></i></div>
          <div className="text-xs font-bold text-gray-300">{badge.name}</div>
          <div className="text-[10px] text-gray-500 mt-1 font-mono">امتیاز: {score}</div>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{ 
                backgroundColor: activeTab === tab.id ? currentTheme.colors.activity : 'transparent',
                color: activeTab === tab.id ? currentTheme.colors.accent : 'gray'
            }}
            className={`w-full flex items-center gap-3 px-4 py-3 transition-all border-r-2 mb-1 ${activeTab === tab.id ? 'border-armin-purple' : 'border-transparent hover:opacity-80'}`}
          >
            <i className={`fas ${tab.icon} text-lg w-6 text-center`}></i>
            <span className="hidden md:block font-medium text-xs">{tab.label}</span>
          </button>
        ))}
      </div>
      
      <div style={{ borderColor: currentTheme.colors.border }} className="p-4 border-t text-[10px] text-gray-500 text-center hidden md:block">
         <div className="mb-2">طراحی: مهندس آرمین دهقان</div>
         <div className="flex justify-center gap-3 mt-2 text-sm">
            <a href="#" className="hover:text-pink-500 transition-colors"><i className="fab fa-instagram"></i></a>
            <a href="#" className="hover:text-yellow-500 transition-colors"><i className="fas fa-envelope"></i></a>
            <a href="#" className="hover:text-blue-500 transition-colors"><i className="fab fa-github"></i></a>
         </div>
      </div>
    </div>
  );
};

// --- Chat Interface ---

const ChatInterface = ({ mode = 'general', subMode = '' }: { mode?: string, subMode?: string }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editInput, setEditInput] = useState('');
  const [showStepsMap, setShowStepsMap] = useState<{[key: string]: boolean}>({});
  
  // Multimodal State
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const { addNotification } = useContext(NotificationContext);
  const { gameMode, setGameMode, addScore } = useContext(GameContext);
  const { addNote } = useContext(NoteContext);
  const { currentTheme } = useContext(ThemeContext);

  const getModel = () => localStorage.getItem(STORAGE_KEYS.MODEL) || DEFAULT_MODEL;
  const getTemp = () => parseFloat(localStorage.getItem(STORAGE_KEYS.TEMP) || '0.7');

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    
    // Scoped KaTeX rendering with Error Handling
    if (chatContainerRef.current && (window as any).renderMathInElement) {
        try {
            (window as any).renderMathInElement(chatContainerRef.current, {
                delimiters: [
                    {left: '$$', right: '$$', display: true},
                    {left: '\\(', right: '\\)', display: false},
                ],
                throwOnError: false
            });
        } catch (e) {
            console.warn("KaTeX render error:", e);
        }
    }

    if (chatContainerRef.current) {
        chatContainerRef.current.querySelectorAll('pre code').forEach((el) => {
            // @ts-ignore
            if (window.hljs) window.hljs.highlightElement(el);
        });
    }
  }, [messages, showStepsMap]);

  // --- Handlers for Multimodal Input ---
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
          const newAttachments: Attachment[] = [];
          for (const file of Array.from(e.target.files)) {
              try {
                  const base64 = await blobToBase64(file);
                  let type: Attachment['type'] = 'file';
                  if (file.type.startsWith('image/')) type = 'image';
                  if (file.type.startsWith('audio/')) type = 'audio';
                  
                  newAttachments.push({
                      type,
                      mimeType: file.type,
                      data: base64,
                      name: file.name
                  });
              } catch (err) {
                  addNotification('error', `خطا در خواندن فایل ${file.name}`);
              }
          }
          setAttachments(prev => [...prev, ...newAttachments]);
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (index: number) => {
      setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const toggleRecording = async () => {
      if (isRecording) {
          mediaRecorderRef.current?.stop();
          setIsRecording(false);
      } else {
          try {
              const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
              const recorder = new MediaRecorder(stream);
              const chunks: BlobPart[] = [];
              
              recorder.ondataavailable = (e) => chunks.push(e.data);
              recorder.onstop = async () => {
                  const blob = new Blob(chunks, { type: 'audio/webm' }); // usually webm or ogg
                  const base64 = await blobToBase64(blob);
                  setAttachments(prev => [...prev, {
                      type: 'audio',
                      mimeType: blob.type || 'audio/webm',
                      data: base64,
                      name: 'Voice_Message.webm'
                  }]);
                  stream.getTracks().forEach(track => track.stop());
              };
              
              recorder.start();
              mediaRecorderRef.current = recorder;
              setIsRecording(true);
          } catch (err) {
              addNotification('error', 'دسترسی به میکروفون امکان‌پذیر نیست.');
          }
      }
  };

  const handleSend = async (overrideText?: string) => {
    const text = overrideText || input;
    // Allow sending if there are attachments even if text is empty
    if (!text.trim() && attachments.length === 0) return;

    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();

    const apiKey = getEffectiveApiKey();
    if (!apiKey) {
        addNotification('error', 'کلید API یافت نشد. لطفاً در تنظیمات وارد کنید.', { text: 'دریافت کلید رایگان', url: 'https://aistudio.google.com/app/apikey' });
        return;
    }

    const ai = new GoogleGenAI({ apiKey });
    
    // Store current attachments for the user message display
    const currentAttachments = [...attachments];
    const userMsg: Message = { id: Date.now().toString(), role: 'user', text, attachments: currentAttachments };
    
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setAttachments([]); // Clear attachments
    setLoading(true);

    try {
      const useSearch = mode === 'general' && !subMode;
      const modelName = useSearch ? SEARCH_MODEL : getModel();
      const tools = useSearch ? [{ googleSearch: {} }] : [];
      
      // Construct parts for the new message
      const parts: any[] = [];
      if (text.trim()) parts.push({ text });
      
      currentAttachments.forEach(att => {
          parts.push({ inlineData: { mimeType: att.mimeType, data: att.data } });
      });
      
      const chatHistory = messages.filter(m => !m.text.includes('[[STEPS]]')).map(m => {
          const histParts: any[] = [{ text: m.text }];
          if (!m.text && m.attachments?.length) {
             histParts[0] = { text: "[User sent attachments]" };
          }
          return { role: m.role, parts: histParts };
      });
      
      let specializedInstruction = "";
      if (mode === 'expert' && subMode && SPECIALIZED_INSTRUCTIONS[subMode]) {
          specializedInstruction = `\n\n**CURRENT SPECIALIZED ROLE:** ${subMode}\n${SPECIALIZED_INSTRUCTIONS[subMode]}`;
      }
      
      let gameInstruction = "";
      if (gameMode) {
          gameInstruction = "\n\n**GAME MODE ACTIVE:** You are in a gamified environment. Teach through challenges. Ask questions. Award points for correct answers by including `[[POINTS:number]]` in your response.";
      }

      const chat = ai.chats.create({
        model: modelName,
        history: chatHistory,
        config: {
           systemInstruction: SYSTEM_INSTRUCTION + specializedInstruction + gameInstruction,
           temperature: getTemp(),
           tools: tools
        }
      });

      // @ts-ignore
      const result = await chat.sendMessage(parts);
      
      let fullText = result.text || "";
      if (!fullText && result.candidates?.[0]?.content?.parts) {
         fullText = result.candidates[0].content.parts.map((p: any) => p.text).join('');
      }

      // Check for points
      const pointMatch = fullText.match(/\[\[POINTS:(\d+)\]\]/);
      if (pointMatch) {
          const points = parseInt(pointMatch[1]);
          addScore(points);
          addNotification('success', `+${points} امتیاز کسب کردید!`, undefined);
          fullText = fullText.replace(pointMatch[0], ''); // Remove internal tag
      }

      let summary = fullText;
      let steps = "";
      if (fullText.includes('[[STEPS]]')) {
          const parts = fullText.split('[[STEPS]]');
          summary = parts[0].trim();
          steps = parts[1].trim();
      }

      const grounding = result.candidates?.[0]?.groundingMetadata;

      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: fullText, 
        summary: summary,
        steps: steps,
        groundingMetadata: grounding
      };

      setMessages(prev => [...prev, botMsg]);

    } catch (error: any) {
      console.error(error);
      const msg = error.message || "Unknown error";
      if (msg.includes('429') || msg.includes('quota')) {
          addNotification('error', '⚠️ سهمیه API تمام شده است. لطفاً کلید جدیدی در تنظیمات وارد کنید.', { text: 'دریافت کلید', url: 'https://aistudio.google.com/app/apikey' });
      } else if (msg.includes('Rpc failed')) {
          addNotification('error', '❌ خطای شبکه. لطفاً اتصال خود را بررسی کنید.');
      } else {
          addNotification('error', `خطا: ${msg}`);
      }
      
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: "❌ خطا در دریافت پاسخ ماورایی. لطفاً مجدداً تلاش کنید." }]);
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleEdit = (msg: Message) => {
    setEditingId(msg.id);
    setEditInput(msg.text);
  };

  const submitEdit = (id: string) => {
    const index = messages.findIndex(m => m.id === id);
    if (index === -1) return;
    const newHistory = messages.slice(0, index);
    setMessages(newHistory);
    setEditingId(null);
    handleSend(editInput);
  };

  const toggleSteps = (id: string) => {
    setShowStepsMap(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const renderContent = (text: string) => {
      // @ts-ignore
      return { __html: marked.parse(text) };
  };

  const downloadFile = (content: string, filename: string, type: string) => {
      // Add Byte Order Mark (BOM) for UTF-8 support (fixes Farsi in Excel/Notepad)
      const bom = '\uFEFF';
      const blob = new Blob([bom + content], { type: type + ';charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 100);
      addNotification('success', 'فایل با موفقیت دانلود شد.', undefined);
  };

  const getCodeContents = (text: string) => {
      const regex = /```(\w+)?\n([\s\S]*?)```/g;
      const matches = [];
      let match;
      while ((match = regex.exec(text)) !== null) {
          matches.push({ lang: match[1] || 'txt', content: match[2] });
      }
      return matches;
  };

  return (
    <div style={{ backgroundColor: currentTheme.colors.bg }} className="flex flex-col h-full relative bg-cover bg-center bg-blend-multiply bg-opacity-10 transition-colors duration-300">
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundColor: currentTheme.colors.bg, opacity: 0.9 }}></div>
      
      {/* Header */}
      <div style={{ borderColor: currentTheme.colors.border, backgroundColor: currentTheme.colors.activity }} className="px-4 py-3 border-b flex justify-between items-center sticky top-0 z-10 shadow-md backdrop-blur opacity-90">
        <div className="flex items-center gap-3">
           <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br ${subMode ? 'from-green-600 to-teal-600' : 'from-purple-600 to-blue-600'}`}>
               <i className={`fas ${subMode ? 'fa-user-graduate' : 'fa-robot'} text-white`}></i>
           </div>
           <div>
             <h2 className="font-bold text-sm" style={{ color: currentTheme.colors.text }}>{subMode || 'چت با آرمین'}</h2>
             <span className="text-[10px] text-armin-green font-mono flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-armin-green animate-pulse"></span>
                Online
             </span>
           </div>
        </div>
        
        <div className="flex items-center gap-2">
            <button 
                onClick={() => setGameMode(!gameMode)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-2 ${gameMode ? 'bg-armin-gold text-black shadow-[0_0_15px_rgba(255,215,0,0.5)]' : 'bg-white/10 text-gray-400'}`}
            >
                <i className={`fas ${gameMode ? 'fa-gamepad' : 'fa-ghost'}`}></i>
                {gameMode ? 'حالت بازی: فعال' : 'حالت بازی'}
            </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-6 scroll-smooth z-10">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 opacity-80">
            <div className="relative mb-6">
                <div className="w-24 h-24 rounded-full border-4 border-dashed border-armin-purple flex items-center justify-center animate-[spin_12s_linear_infinite]"></div>
                <i className="fas fa-atom text-5xl text-armin-gold absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"></i>
            </div>
            <p className="text-3xl font-black text-white tracking-tighter mb-2">Armin AI</p>
            <p className="text-sm font-mono text-armin-cyan tracking-widest uppercase">Supernatural Edition</p>
            <p className="mt-4 text-xs text-gray-500">طراح: مهندس آرمین دهقان</p>
            
            {subMode && (
                <div style={{ borderColor: currentTheme.colors.border }} className="mt-8 p-4 bg-white/5 rounded-xl border max-w-md text-center">
                    <p className="text-sm font-bold text-white mb-1">دستیار تخصصی فعال است</p>
                    <p className="text-xs text-gray-400">{SPECIALIZED_INSTRUCTIONS[subMode]?.split('.')[0]}</p>
                </div>
            )}
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} group animate-fade-in`}>
             {editingId === msg.id ? (
                 <div style={{ backgroundColor: currentTheme.colors.input, borderColor: currentTheme.colors.accent }} className="w-full max-w-2xl border p-3 rounded-lg shadow-2xl">
                     <textarea 
                        value={editInput}
                        onChange={e => setEditInput(e.target.value)}
                        className="w-full bg-transparent text-white resize-none outline-none font-sans text-sm h-32"
                     />
                     <div className="flex justify-end gap-2 mt-2">
                         <button onClick={() => setEditingId(null)} className="px-3 py-1 text-xs text-gray-400 hover:text-white border border-gray-600 rounded">لغو</button>
                         <button onClick={() => submitEdit(msg.id)} className="px-3 py-1 text-xs bg-armin-green text-black font-bold rounded hover:bg-green-400">ارسال مجدد</button>
                     </div>
                 </div>
             ) : (
                <div style={{
                    backgroundColor: msg.role === 'user' ? currentTheme.colors.accent : currentTheme.colors.sidebar,
                    borderColor: currentTheme.colors.border
                }} className={`relative max-w-[90%] md:max-w-[80%] rounded-2xl p-4 shadow-lg border text-white rounded-${msg.role === 'user' ? 'br' : 'bl'}-sm`}>
                    {/* Header */}
                    <div className="flex justify-between items-center mb-2 pb-2 border-b border-white/5">
                        <span className="text-[10px] font-bold opacity-60 uppercase tracking-widest">
                            {msg.role === 'user' ? 'YOU' : 'ARMIN AI'}
                        </span>
                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            {msg.role === 'model' && (
                                <button onClick={() => {
                                    addNote(msg.summary || msg.text);
                                    addNotification('success', 'به دفترچه یادداشت اضافه شد.');
                                }} className="text-gray-400 hover:text-armin-gold" title="ذخیره در یادداشت">
                                    <i className="fas fa-bookmark text-xs"></i>
                                </button>
                            )}
                            {msg.role === 'user' && (
                                <button onClick={() => handleEdit(msg)} className="text-gray-400 hover:text-white" title="ویرایش پیام">
                                    <i className="fas fa-pen text-xs"></i>
                                </button>
                            )}
                            <button onClick={() => navigator.clipboard.writeText(msg.text)} className="text-gray-400 hover:text-white" title="کپی متن">
                                <i className="fas fa-copy text-xs"></i>
                            </button>
                        </div>
                    </div>

                    {/* User Attachments Display */}
                    {msg.attachments && msg.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3">
                            {msg.attachments.map((att, idx) => (
                                <div key={idx} className="bg-black/20 rounded-lg overflow-hidden border border-white/10 flex items-center">
                                    {att.type === 'image' ? (
                                        <img src={`data:${att.mimeType};base64,${att.data}`} className="h-20 w-auto object-cover" alt="attachment" />
                                    ) : att.type === 'audio' ? (
                                        <div className="p-2 flex items-center gap-2">
                                           <i className="fas fa-microphone text-armin-gold"></i>
                                           <audio controls src={`data:${att.mimeType};base64,${att.data}`} className="h-8 w-32" />
                                        </div>
                                    ) : (
                                        <div className="p-2 text-xs flex items-center gap-2">
                                            <i className="fas fa-file text-blue-400"></i>
                                            <span className="truncate max-w-[100px]">{att.name}</span>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Content */}
                    <div className="markdown-body" dangerouslySetInnerHTML={renderContent(msg.summary || msg.text)}></div>

                    {/* Grounding */}
                    {msg.groundingMetadata?.groundingChunks && (
                        <div className="mt-3 p-3 bg-black/20 rounded border border-vscode-border text-xs">
                             <div className="font-bold text-blue-400 mb-1 flex items-center gap-2">
                                 <i className="fab fa-google"></i> منابع گوگل
                             </div>
                             <div className="flex flex-wrap gap-2">
                                 {msg.groundingMetadata.groundingChunks.map((chunk: any, idx: number) => (
                                     chunk.web?.uri && (
                                         <a key={idx} href={chunk.web.uri} target="_blank" className="bg-vscode-bg px-2 py-1 rounded hover:bg-vscode-accent truncate max-w-[200px] flex items-center gap-1 border border-gray-700 transition-colors">
                                             <i className="fas fa-link text-[10px]"></i> {chunk.web.title || "منبع " + (idx+1)}
                                         </a>
                                     )
                                 ))}
                             </div>
                        </div>
                    )}

                    {/* Reasoning Steps */}
                    {msg.steps && (
                        <div className="mt-3">
                            <button 
                                onClick={() => toggleSteps(msg.id)}
                                className="text-xs flex items-center gap-2 text-armin-cyan hover:text-white transition-colors bg-white/10 px-3 py-1.5 rounded border border-white/20 hover:border-armin-cyan"
                            >
                                <i className={`fas ${showStepsMap[msg.id] ? 'fa-chevron-up' : 'fa-microchip'}`}></i>
                                {showStepsMap[msg.id] ? 'پنهان کردن مراحل تفکر' : 'نمایش مراحل حل ماورایی'}
                            </button>
                            {showStepsMap[msg.id] && (
                                <div className="mt-2 p-3 bg-black/30 rounded border-l-2 border-armin-purple animate-slide-up">
                                    <div className="text-[10px] text-armin-purple font-mono mb-2">REASONING PROCESS:</div>
                                    <div className="markdown-body text-sm text-gray-300" dangerouslySetInnerHTML={renderContent(msg.steps)}></div>
                                </div>
                            )}
                        </div>
                    )}
                    
                    {/* File Downloads - Generalized for multiple files */}
                    {msg.role === 'model' && getCodeContents(msg.text).length > 0 && (
                        <div className="mt-2 pt-2 border-t border-white/5 flex flex-wrap gap-2">
                             {getCodeContents(msg.text).map((code, idx) => (
                                 <button key={idx} onClick={() => {
                                     downloadFile(code.content, `armin-file-${idx + 1}.${code.lang === 'python' ? 'py' : code.lang === 'html' ? 'html' : code.lang === 'csv' ? 'csv' : 'txt'}`, 'text/plain');
                                 }} className="text-[10px] bg-black/30 hover:bg-gray-700 px-3 py-1.5 rounded border border-gray-600 text-gray-300 flex items-center gap-2 transition-all hover:border-armin-green">
                                     <i className="fas fa-download text-armin-green"></i> دانلود فایل {code.lang}
                                 </button>
                             ))}
                        </div>
                    )}
                </div>
             )}
          </div>
        ))}
        
        {loading && (
          <div style={{ backgroundColor: currentTheme.colors.activity, borderColor: currentTheme.colors.border }} className="flex items-center gap-3 pl-4 animate-fade-in p-3 rounded-lg w-fit border">
             <div className="flex gap-1">
                 <span className="w-1.5 h-4 bg-armin-purple animate-[pulse_1s_ease-in-out_infinite]"></span>
                 <span className="w-1.5 h-4 bg-armin-blue animate-[pulse_1s_ease-in-out_0.2s_infinite]"></span>
                 <span className="w-1.5 h-4 bg-armin-gold animate-[pulse_1s_ease-in-out_0.4s_infinite]"></span>
             </div>
             <span className="text-xs text-gray-400 font-mono">در حال پردازش ماورایی...</span>
             <button onClick={() => abortControllerRef.current?.abort()} className="ml-4 text-red-400 hover:text-red-200 text-xs px-2 py-0.5 border border-red-500/30 rounded">
                <i className="fas fa-stop"></i>
             </button>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{ backgroundColor: currentTheme.colors.activity, borderColor: currentTheme.colors.border }} className="p-4 border-t z-10 flex flex-col gap-2">
        {/* Attachment Previews */}
        {attachments.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-2">
                {attachments.map((att, idx) => (
                    <div key={idx} style={{ backgroundColor: currentTheme.colors.input }} className="relative group border border-white/20 rounded-lg p-1 min-w-[60px] h-[60px] flex items-center justify-center">
                        <button onClick={() => removeAttachment(idx)} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10">
                            <i className="fas fa-times"></i>
                        </button>
                        {att.type === 'image' ? (
                            <img src={`data:${att.mimeType};base64,${att.data}`} className="h-full w-auto object-cover rounded" alt="preview" />
                        ) : att.type === 'audio' ? (
                            <i className="fas fa-microphone text-armin-gold text-lg"></i>
                        ) : (
                            <i className="fas fa-file text-blue-400 text-lg"></i>
                        )}
                        <span className="absolute bottom-0 text-[8px] bg-black/50 text-white w-full text-center truncate px-1">{att.name}</span>
                    </div>
                ))}
            </div>
        )}

        <div style={{ backgroundColor: currentTheme.colors.input }} className="relative flex items-end gap-2 border border-gray-600 rounded-lg p-1 focus-within:border-vscode-accent transition-colors shadow-inner">
           <input 
              type="file" 
              multiple 
              ref={fileInputRef} 
              className="hidden" 
              onChange={handleFileSelect}
              accept="image/*,audio/*,.pdf,.txt,.csv,.json"
           />
           
           <button 
             onClick={() => fileInputRef.current?.click()}
             className="p-3 text-gray-400 hover:text-white transition-colors"
             title="پیوست فایل یا تصویر"
           >
             <i className="fas fa-paperclip"></i>
           </button>

           <textarea
             value={input}
             onChange={(e) => setInput(e.target.value)}
             onKeyDown={(e) => {
               if (e.key === 'Enter' && !e.shiftKey) {
                 e.preventDefault();
                 handleSend();
               }
             }}
             placeholder={subMode ? `سوال تخصصی از ${subMode} بپرسید...` : "سوال خود را بپرسید یا عکس/فایل ارسال کنید..."}
             className="w-full bg-transparent text-white border-none focus:ring-0 resize-none max-h-40 min-h-[50px] py-3 px-1 font-sans text-sm"
           />
           
           <button 
             onClick={toggleRecording}
             className={`p-3 rounded mb-1 transition-all ${isRecording ? 'text-red-500 animate-pulse' : 'text-gray-400 hover:text-white'}`}
             title={isRecording ? 'توقف ضبط' : 'ضبط صدا'}
           >
             <i className={`fas ${isRecording ? 'fa-stop-circle' : 'fa-microphone'}`}></i>
           </button>

           <button 
             onClick={() => handleSend()}
             disabled={loading || (!input.trim() && attachments.length === 0)}
             style={{ backgroundColor: (input.trim() || attachments.length > 0) ? currentTheme.colors.accent : 'transparent' }}
             className={`p-3 rounded mb-1 mr-1 transition-all ${input.trim() || attachments.length > 0 ? 'text-white shadow-lg hover:brightness-110' : 'text-gray-500 cursor-not-allowed'}`}
           >
             <i className="fas fa-paper-plane"></i>
           </button>
        </div>
      </div>
    </div>
  );
};

// --- Expert Assistant ---
const ExpertAssistant = () => {
  const [role, setRole] = useState('');
  const { currentTheme } = useContext(ThemeContext);
  
  // Categorized Roles based on user request
  const categories = [
    {
        id: 'elementary', name: 'ابتدایی', icon: 'fa-shapes', color: 'text-pink-400',
        items: ['معلم دبستان']
    },
    {
        id: 'junior', name: 'متوسطه اول', icon: 'fa-book-reader', color: 'text-green-400',
        items: ['معلم متوسطه اول', 'مشاور هدایت تحصیلی']
    },
    {
        id: 'senior_theory', name: 'متوسطه دوم (نظری)', icon: 'fa-university', color: 'text-blue-400',
        items: ['ریاضی فیزیک', 'علوم تجربی', 'علوم انسانی', 'مشاور کنکور']
    },
    {
        id: 'vocational', name: 'فنی و حرفه‌ای', icon: 'fa-tools', color: 'text-orange-400',
        items: ['شبکه و نرم‌افزار', 'حسابداری', 'معماری', 'مکانیک خودرو', 'الکترونیک']
    },
    {
        id: 'expert', name: 'تخصصی و دانشگاهی', icon: 'fa-user-tie', color: 'text-purple-400',
        items: ['مهندس نرم‌افزار', 'مهندس سخت‌افزار', 'تحلیلگر داده', 'پزشک و سلامت', 'روانشناس', 'تاریخ‌دان', 'استان‌شناس']
    }
  ];

  return (
    <div style={{ backgroundColor: currentTheme.colors.bg }} className="flex h-full">
       <div style={{ backgroundColor: currentTheme.colors.sidebar, borderColor: currentTheme.colors.border }} className="w-72 border-l hidden lg:flex flex-col overflow-y-auto">
          <div style={{ borderColor: currentTheme.colors.border }} className="p-4 border-b bg-white/5 sticky top-0 z-10">
              <h3 className="font-bold text-gray-200 text-sm flex items-center gap-2">
                  <i className="fas fa-layer-group text-armin-gold"></i>
                  <span>دپارتمان‌های تخصصی</span>
              </h3>
          </div>
          
          <div className="p-2 space-y-4">
            {categories.map((cat) => (
                <div key={cat.id} className="animate-slide-up">
                    <div className={`text-xs font-bold uppercase mb-2 px-3 flex items-center gap-2 ${cat.color} opacity-90`}>
                        <i className={`fas ${cat.icon}`}></i> {cat.name}
                    </div>
                    <div className="space-y-1">
                    {cat.items.map(r => (
                        <button 
                            key={r}
                            onClick={() => setRole(r)}
                            className={`w-full text-right px-3 py-2.5 rounded-lg text-sm transition-all border-r-2 flex items-center justify-between group ${role === r ? 'bg-white/10 border-armin-gold text-white shadow-md' : 'border-transparent text-gray-400 hover:text-white hover:bg-white/5'}`}
                        >
                            <span>{r}</span>
                            {role === r && <i className="fas fa-chevron-left text-[10px] text-armin-gold"></i>}
                        </button>
                    ))}
                    </div>
                </div>
            ))}
          </div>
       </div>
       
       <div className="flex-1 relative">
          {!role ? (
             <div className="h-full flex flex-col items-center justify-center text-gray-500 opacity-60 bg-[radial-gradient(circle_at_center,_rgba(60,0,100,0.2),transparent_70%)]">
                <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center mb-6 shadow-2xl border border-gray-700">
                    <i className="fas fa-user-astronaut text-5xl text-armin-purple animate-pulse-glow"></i>
                </div>
                <h2 className="text-2xl font-bold text-gray-200">دستیار تخصصی آرمین</h2>
                <p className="text-sm mt-2 max-w-md text-center leading-relaxed">
                    لطفاً برای شروع مشاوره یا آموزش، یکی از تخصص‌ها را از منوی سمت راست انتخاب کنید.
                </p>
                <div className="mt-8 flex gap-4 text-xs font-mono text-gray-600">
                    <span><i className="fas fa-check text-green-500 mr-1"></i>آموزش ماورایی</span>
                    <span><i className="fas fa-check text-green-500 mr-1"></i>حل تمرین</span>
                    <span><i className="fas fa-check text-green-500 mr-1"></i>مشاوره</span>
                </div>
             </div>
          ) : (
             <ChatInterface mode="expert" subMode={role} />
          )}
       </div>
    </div>
  );
};

// --- Notebook Component ---
const Notebook = () => {
    const { notes, deleteNote } = useContext(NoteContext);
    const { currentTheme } = useContext(ThemeContext);
    const [search, setSearch] = useState('');

    const filtered = notes.filter(n => n.content.toLowerCase().includes(search.toLowerCase()) || n.tags.some(t => t.toLowerCase().includes(search.toLowerCase())));

    return (
        <div style={{ backgroundColor: currentTheme.colors.bg }} className="h-full p-6 overflow-y-auto">
             <div className="max-w-4xl mx-auto">
                 <div className="flex justify-between items-center mb-6 border-b pb-4" style={{ borderColor: currentTheme.colors.border }}>
                     <h2 className="text-2xl font-bold" style={{ color: currentTheme.colors.text }}>دفترچه یادداشت هوشمند</h2>
                     <div className="relative">
                         <input 
                            type="text" 
                            placeholder="جستجو در یادداشت‌ها..." 
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            style={{ backgroundColor: currentTheme.colors.input, borderColor: currentTheme.colors.border, color: currentTheme.colors.text }}
                            className="pl-3 pr-10 py-2 rounded-lg border focus:outline-none focus:border-armin-gold w-64 text-sm"
                         />
                         <i className="fas fa-search absolute left-3 top-3 text-gray-500"></i>
                     </div>
                 </div>

                 {filtered.length === 0 ? (
                     <div className="text-center text-gray-500 mt-20">
                         <i className="fas fa-book-open text-6xl mb-4 opacity-30"></i>
                         <p>هنوز یادداشتی ندارید. در چت روی دکمه <i className="fas fa-bookmark mx-1"></i> کلیک کنید.</p>
                     </div>
                 ) : (
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         {filtered.map(note => (
                             <div key={note.id} style={{ backgroundColor: currentTheme.colors.activity, borderColor: currentTheme.colors.border }} className="p-4 rounded-xl border relative group transition-transform hover:-translate-y-1 hover:shadow-lg">
                                 <button onClick={() => deleteNote(note.id)} className="absolute top-2 left-2 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                     <i className="fas fa-trash"></i>
                                 </button>
                                 <div className="text-xs text-gray-400 mb-2 font-mono text-right">{new Date(note.date).toLocaleDateString('fa-IR')}</div>
                                 <div className="markdown-body text-sm overflow-hidden max-h-60" dangerouslySetInnerHTML={{__html: (window as any).marked.parse(note.content)}} style={{ direction: 'rtl', textAlign: 'right' }}></div>
                             </div>
                         ))}
                     </div>
                 )}
             </div>
        </div>
    );
};

// --- File Analyzer ---
const FileAnalyzer = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [analysis, setAnalysis] = useState('');
  const [loading, setLoading] = useState(false);
  const { addNotification } = useContext(NotificationContext);
  const { currentTheme } = useContext(ThemeContext);
  const inputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setFiles(Array.from(e.target.files));
  };

  useEffect(() => {
     if (analysis && contentRef.current && (window as any).renderMathInElement) {
         try {
            (window as any).renderMathInElement(contentRef.current, {
                delimiters: [
                    {left: '$$', right: '$$', display: true},
                    {left: '\\(', right: '\\)', display: false},
                ],
                throwOnError: false
            });
         } catch(e) {
             console.warn("KaTeX render error in file analyzer:", e);
         }
     }
  }, [analysis]);

  const analyze = async () => {
      if (files.length === 0) return;
      setLoading(true);
      setAnalysis('');
      const apiKey = getEffectiveApiKey();
      if (!apiKey) {
          addNotification('error', 'API Key missing. Please set in Settings.', { text: 'دریافت کلید', url: 'https://aistudio.google.com/app/apikey' });
          setLoading(false);
          return;
      }
      
      const ai = new GoogleGenAI({ apiKey });
      const parts: any[] = [];
      parts.push({ text: "Analyze these files comprehensively. Provide summary, data points, and code if applicable. Answer in Persian." });

      for (const f of files) {
          try {
              if (f.type.includes('image') || f.type.includes('pdf')) {
                  const b64 = await blobToBase64(f);
                  parts.push({ inlineData: { mimeType: f.type, data: b64 } });
              } else {
                  // Text based: csv, json, txt, code
                  const text = await f.text();
                  parts.push({ text: `\n--- FILE: ${f.name} ---\n${text}\n--- END FILE ---\n` });
              }
          } catch (e) {
              addNotification('warning', `Skipped ${f.name}: Error reading file.`, undefined);
          }
      }

      try {
         const result = await ai.models.generateContent({
             model: 'gemini-2.5-flash-latest', // Best for multimodal
             contents: { role: 'user', parts },
             config: { systemInstruction: SYSTEM_INSTRUCTION }
         });
         setAnalysis(result.text || '');
         addNotification('success', 'تحلیل فایل‌ها با موفقیت انجام شد.', undefined);
      } catch (e: any) {
         addNotification('error', `Error analyzing files: ${e.message}`, undefined);
      } finally {
         setLoading(false);
      }
  };

  return (
     <div style={{ backgroundColor: currentTheme.colors.bg }} className="p-8 h-full overflow-y-auto">
        <div className="max-w-5xl mx-auto">
            <div style={{ borderColor: currentTheme.colors.border, backgroundColor: currentTheme.colors.activity }} className="border-2 border-dashed rounded-xl p-10 text-center hover:opacity-80 transition-opacity cursor-pointer group" onClick={() => inputRef.current?.click()}>
               <input type="file" multiple ref={inputRef} className="hidden" onChange={handleFileChange} accept=".pdf,.csv,.json,.txt,.doc,.docx,.png,.jpg,.jpeg,.py,.js,.html,.xml" />
               <i className="fas fa-cloud-upload-alt text-5xl mb-4 group-hover:scale-110 transition-transform" style={{ color: currentTheme.colors.accent }}></i>
               <h3 className="text-xl font-bold" style={{ color: currentTheme.colors.text }}>آپلود فایل‌های چندگانه</h3>
               <p className="text-gray-400 text-sm mt-2">PDF, CSV, JSON, Word, Images, Code, XML</p>
            </div>
            
            {files.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4 justify-center animate-slide-up">
                    {files.map((f, i) => (
                        <div key={i} style={{ backgroundColor: currentTheme.colors.input, borderColor: currentTheme.colors.border }} className="px-3 py-2 rounded text-xs flex items-center gap-2 border text-gray-200">
                            <i className={`fas ${f.name.endsWith('json') ? 'fa-code text-yellow-400' : f.name.endsWith('pdf') ? 'fa-file-pdf text-red-400' : f.name.endsWith('csv') ? 'fa-table text-green-400' : 'fa-file text-blue-400'}`}></i>
                            {f.name}
                        </div>
                    ))}
                </div>
            )}
            
            <button onClick={analyze} disabled={loading || files.length === 0} className="w-full mt-6 py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold rounded shadow-lg hover:shadow-purple-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                {loading ? <span className="flex items-center justify-center gap-2"><i className="fas fa-spinner fa-spin"></i> در حال تحلیل...</span> : 'شروع تحلیل ماورایی'}
            </button>

            {analysis && (
                <div style={{ backgroundColor: currentTheme.colors.activity, borderColor: currentTheme.colors.border }} className="mt-8 p-6 rounded-lg border shadow-xl animate-fade-in relative">
                    <button onClick={() => navigator.clipboard.writeText(analysis)} className="absolute top-4 left-4 text-gray-400 hover:text-white"><i className="fas fa-copy"></i></button>
                    <div ref={contentRef} className="markdown-body" dangerouslySetInnerHTML={{__html: (window as any).marked.parse(analysis) as string}}></div>
                </div>
            )}
        </div>
     </div>
  );
};

// --- Image Generator ---
const ImageGenerator = () => {
  const [prompt, setPrompt] = useState('');
  const [img, setImg] = useState('');
  const [loading, setLoading] = useState(false);
  const { addNotification } = useContext(NotificationContext);
  const { currentTheme } = useContext(ThemeContext);

  const generate = async () => {
     if (!prompt) return;
     setLoading(true);
     setImg('');
     try {
        const apiKey = getEffectiveApiKey();
        if (!apiKey) {
             addNotification('error', 'API Key not found', undefined);
             setLoading(false);
             return;
        }
        
        const ai = new GoogleGenAI({ apiKey });
        
        // 1. Enhance the prompt using a text model first (Translate Farsi to Detailed English)
        let finalPrompt = prompt;
        try {
            const enhancement = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: `Rewrite the following prompt into a highly detailed, descriptive English image generation prompt. The user wants the image to be generated based on English or Arabic descriptions only to avoid rendering issues. Translate any Farsi input to English. CRITICAL: The image generation model cannot render Farsi text. If the user asks for text inside the image, convert it to English or Arabic. Input: "${prompt}"`,
                config: { responseMimeType: 'text/plain' }
            });
            if (enhancement.text) {
                finalPrompt = enhancement.text;
                addNotification('info', 'بهینه‌سازی پرامپت: ' + finalPrompt.substring(0, 50) + '...', undefined);
            }
        } catch (e) {
            console.warn("Enhancement failed, using original prompt");
        }
        
        // 2. Generate Image with Enhanced Prompt
        const res = await ai.models.generateContent({
            model: IMAGE_GEN_MODEL,
            contents: { role: 'user', parts: [{ text: finalPrompt }] }
        });
        
        let b64 = null;
        const parts = res.candidates?.[0]?.content?.parts;
        if (parts) {
            for (const part of parts) {
                if (part.inlineData) {
                    b64 = part.inlineData.data;
                    break;
                }
            }
        }
        
        if (b64) {
            setImg(`data:image/jpeg;base64,${b64}`);
            addNotification('success', 'تصویر با کیفیت ماورایی ساخته شد.', undefined);
        } else {
             addNotification('warning', 'تصویری ساخته نشد. مدل متنی پاسخ داد.', undefined);
        }

     } catch (e: any) {
        console.error(e);
        addNotification('error', 'خطا در تولید تصویر: ' + e.message, undefined);
     } finally {
        setLoading(false);
     }
  };

  return (
    <div style={{ backgroundColor: currentTheme.colors.bg }} className="h-full flex flex-col items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_10%,_rgba(120,0,200,0.1),transparent_70%)]"></div>
        <div className="w-full max-w-4xl z-10">
            <h2 className="text-4xl font-black text-center mb-2 text-transparent bg-clip-text bg-gradient-to-r from-armin-purple to-pink-500 animate-pulse-glow">Nano Banana Studio</h2>
            <p className="text-center text-gray-500 mb-8 text-sm">موتور تولید تصویر ماورایی - واقعی و آموزشی</p>
            
            <div style={{ backgroundColor: currentTheme.colors.activity, borderColor: currentTheme.colors.border }} className="flex gap-2 mb-8 p-2 rounded-xl border shadow-2xl">
                <input value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="توصیف تصویر (مثلا: کلاس درس مدرن در ایران...)" className="flex-1 bg-transparent border-none p-4 text-white focus:ring-0 outline-none text-lg" />
                <button onClick={generate} disabled={loading} className="px-8 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold rounded-lg hover:brightness-110 transition-all shadow-lg">
                   {loading ? <i className="fas fa-magic fa-spin"></i> : <i className="fas fa-paint-brush"></i>}
                </button>
            </div>

            <div style={{ borderColor: currentTheme.colors.border }} className="aspect-video bg-black/40 rounded-xl border flex items-center justify-center overflow-hidden relative shadow-2xl group">
                {img ? (
                    <>
                        <img src={img} className="w-full h-full object-contain animate-fade-in" />
                        <a href={img} download={`armin-art-${Date.now()}.png`} className="absolute bottom-4 right-4 bg-black/70 text-white px-4 py-2 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black">
                            <i className="fas fa-download mr-2"></i> دانلود کیفیت بالا
                        </a>
                    </>
                ) : (
                    <div className="text-gray-600 flex flex-col items-center">
                        <i className="fas fa-image text-6xl mb-4 opacity-50"></i>
                        <p>منتظر دستور خلاقانه شما...</p>
                    </div>
                )}
            </div>
        </div>
    </div>
  );
};

// --- Settings ---
const Settings = () => {
  const [key, setKey] = useState(localStorage.getItem(STORAGE_KEYS.CUSTOM_KEY) || '');
  const [model, setModel] = useState(localStorage.getItem(STORAGE_KEYS.MODEL) || DEFAULT_MODEL);
  const [temp, setTemp] = useState(localStorage.getItem(STORAGE_KEYS.TEMP) || '0.7');
  const { addNotification } = useContext(NotificationContext);
  const { currentTheme, setThemeId } = useContext(ThemeContext);

  const save = () => {
     localStorage.setItem(STORAGE_KEYS.CUSTOM_KEY, key);
     localStorage.setItem(STORAGE_KEYS.MODEL, model);
     localStorage.setItem(STORAGE_KEYS.TEMP, temp);
     addNotification('success', 'تنظیمات با موفقیت ذخیره شد.', undefined);
  };

  return (
    <div style={{ backgroundColor: currentTheme.colors.bg }} className="h-full overflow-y-auto">
        <div className="p-8 max-w-2xl mx-auto mt-10 space-y-8 animate-slide-up">
        <div>
            <h2 className="text-3xl font-bold border-b pb-4 mb-2" style={{ color: currentTheme.colors.text, borderColor: currentTheme.colors.border }}>تنظیمات سیستم</h2>
            <p className="text-gray-400 text-sm">پیکربندی هسته مرکزی هوش مصنوعی آرمین</p>
        </div>
        
        {/* Theme Selection */}
        <div style={{ backgroundColor: currentTheme.colors.activity, borderColor: currentTheme.colors.border }} className="p-6 rounded-xl border">
            <h3 className="font-bold mb-4" style={{ color: currentTheme.colors.text }}>تم رنگی</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Object.values(THEMES).map(t => (
                    <button 
                        key={t.id}
                        onClick={() => setThemeId(t.id)}
                        className={`p-3 rounded-lg border-2 transition-all flex flex-col items-center gap-2 ${currentTheme.id === t.id ? 'border-armin-gold' : 'border-transparent hover:bg-white/5'}`}
                    >
                        <div className="w-8 h-8 rounded-full border border-white/20" style={{ background: `linear-gradient(135deg, ${t.colors.sidebar} 50%, ${t.colors.bg} 50%)` }}></div>
                        <span className="text-xs" style={{ color: currentTheme.colors.text }}>{t.name}</span>
                    </button>
                ))}
            </div>
        </div>
        
        <div style={{ backgroundColor: currentTheme.colors.activity, borderColor: currentTheme.colors.border }} className="p-6 rounded-xl border">
            <label className="block text-sm font-bold text-armin-gold mb-2 flex justify-between">
                <span>کلید API اختصاصی (Gemini)</span>
                <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-blue-400 text-xs hover:underline"><i className="fas fa-external-link-alt"></i> دریافت کلید رایگان</a>
            </label>
            <input type="password" value={key} onChange={e => setKey(e.target.value)} style={{ backgroundColor: currentTheme.colors.input, borderColor: currentTheme.colors.border }} className="w-full p-3 rounded border text-white focus:border-armin-gold outline-none transition-colors" placeholder="کلید خود را اینجا وارد کنید..." />
            <p className="text-xs text-gray-500 mt-2">برای رفع محدودیت‌ها، لطفاً از کلید شخصی خود استفاده کنید.</p>
        </div>

        <div style={{ backgroundColor: currentTheme.colors.activity, borderColor: currentTheme.colors.border }} className="p-6 rounded-xl border">
            <label className="block text-sm font-bold text-gray-300 mb-2">مدل هوش مصنوعی</label>
            <select value={model} onChange={e => setModel(e.target.value)} style={{ backgroundColor: currentTheme.colors.input, borderColor: currentTheme.colors.border }} className="w-full p-3 rounded border text-white focus:border-vscode-accent outline-none">
                <option value={DEFAULT_MODEL}>{DEFAULT_MODEL} (Standard)</option>
                <option value={SEARCH_MODEL}>{SEARCH_MODEL} (Reasoning + Search)</option>
                <option value="gemini-2.5-flash-latest">Gemini 2.5 Flash (Fast)</option>
            </select>
        </div>

        <div style={{ backgroundColor: currentTheme.colors.activity, borderColor: currentTheme.colors.border }} className="p-6 rounded-xl border">
            <label className="block text-sm font-bold text-gray-300 mb-4 flex justify-between">
                <span>درجه خلاقیت (Temperature)</span>
                <span style={{ backgroundColor: currentTheme.colors.input }} className="px-2 py-1 rounded text-xs font-mono">{temp}</span>
            </label>
            <input type="range" min="0" max="2" step="0.1" value={temp} onChange={e => setTemp(e.target.value)} className="w-full accent-armin-purple h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer" />
            <div className="flex justify-between text-xs text-gray-500 mt-2">
                <span>دقیق و منطقی (0.0)</span>
                <span>خلاق و ماورایی (2.0)</span>
            </div>
        </div>

        <button onClick={save} className="w-full py-4 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 shadow-lg transition-transform hover:scale-[1.02]">
            <i className="fas fa-save mr-2"></i> ذخیره تغییرات
        </button>
        
        <div className="text-center pt-8 border-t border-gray-800">
            <p className="text-gray-500 text-xs">Armin AI Supernatural Edition v2.1</p>
        </div>
        </div>
    </div>
  );
};

// --- App Root ---
const App = () => {
  const [activeTab, setActiveTab] = useState('chat');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  
  // Game State
  const [score, setScore] = useState(() => {
     try {
         return parseInt(localStorage.getItem(STORAGE_KEYS.SCORE) || '0')
     } catch (e) {
         return 0;
     }
  });
  const [gameMode, setGameMode] = useState(false);
  
  // Notes State
  const [notes, setNotes] = useState<Note[]>(() => {
     try {
         const saved = localStorage.getItem(STORAGE_KEYS.NOTES);
         return saved ? JSON.parse(saved) : [];
     } catch (e) {
         console.error("Failed to parse notes", e);
         return [];
     }
  });

  // Theme State
  const [themeId, setThemeId] = useState(() => localStorage.getItem(STORAGE_KEYS.THEME) || 'vscode');

  useEffect(() => { localStorage.setItem(STORAGE_KEYS.SCORE, score.toString()); }, [score]);
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.NOTES, JSON.stringify(notes)); }, [notes]);
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.THEME, themeId); }, [themeId]);

  const addScore = (pts: number) => setScore(prev => prev + pts);

  const addNote = (content: string) => {
      const newNote: Note = {
          id: Date.now().toString(),
          content,
          tags: [],
          date: new Date().toISOString()
      };
      setNotes(prev => [newNote, ...prev]);
  };

  const deleteNote = (id: string) => setNotes(prev => prev.filter(n => n.id !== id));

  const addNotification = (type: NotificationType, message: string, link?: { text: string; url: string }) => {
    const id = Date.now().toString();
    setNotifications(prev => [...prev, { id, type, message, link }]);
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 6000);
  };

  const removeNotification = (id: string) => setNotifications(prev => prev.filter(n => n.id !== id));

  const currentTheme = THEMES[themeId] || THEMES.vscode;

  return (
    <ThemeContext.Provider value={{ currentTheme, setThemeId }}>
    <GameContext.Provider value={{ score, addScore, gameMode, setGameMode }}>
    <NoteContext.Provider value={{ notes, addNote, deleteNote }}>
    <NotificationContext.Provider value={{ addNotification }}>
       <div className="flex h-screen w-screen overflow-hidden font-sans selection:bg-armin-purple selection:text-white" style={{ color: currentTheme.colors.text, backgroundColor: currentTheme.colors.bg }}>
          <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
          <div className="flex-1 relative flex flex-col min-w-0">
             <NotificationSystem notifications={notifications} removeNotification={removeNotification} />
             {activeTab === 'chat' && <ChatInterface mode="general" />}
             {activeTab === 'expert' && <ExpertAssistant />}
             {activeTab === 'files' && <FileAnalyzer />}
             {activeTab === 'images' && <ImageGenerator />}
             {activeTab === 'notes' && <Notebook />}
             {activeTab === 'settings' && <Settings />}
          </div>
       </div>
    </NotificationContext.Provider>
    </NoteContext.Provider>
    </GameContext.Provider>
    </ThemeContext.Provider>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(
    <ErrorBoundary>
        <App />
    </ErrorBoundary>
);