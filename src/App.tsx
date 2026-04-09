/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from 'react';
import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { db } from './firebase';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  orderBy, 
  Timestamp,
  doc,
  getDoc
} from 'firebase/firestore';
import { 
  LayoutDashboard, 
  Wallet, 
  TrendingUp, 
  Target, 
  Plus, 
  BrainCircuit,
  LogOut,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  FileUp,
  LogIn
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  LineChart,
  Line
} from 'recharts';
import { analyzeTransaction, getFinancialAdvice, parseBankStatement } from './services/geminiService';
import { format } from 'date-fns';
import * as pdfjsLib from 'pdfjs-dist';

// Set worker for PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

const CATEGORIES = [
  "Housing", "Transportation", "Food", "Utilities", "Healthcare", 
  "Insurance", "Savings", "Debt", "Entertainment", "Personal", "Other"
];

const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff8042', '#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#a4de6c', '#d0ed57'];

function Dashboard() {
  const { user, logout, login } = useAuth();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [transactions, setTransactions] = useState<any[]>([]);
  const [budgets, setBudgets] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [aiAdvice, setAiAdvice] = useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showAddTx, setShowAddTx] = useState(false);
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  
  // Local state for non-logged in users
  const [localTransactions, setLocalTransactions] = useState<any[]>([]);

  useEffect(() => {
    if (!user) {
      const savedTx = localStorage.getItem('finai_local_tx');
      if (savedTx) setLocalTransactions(JSON.parse(savedTx));
      const savedGoals = localStorage.getItem('finai_local_goals');
      if (savedGoals) setGoals(JSON.parse(savedGoals));
      return;
    }

    const qTx = query(
      collection(db, 'transactions'), 
      where('userId', '==', user.uid),
      orderBy('date', 'desc')
    );
    const unsubTx = onSnapshot(qTx, (snapshot) => {
      setTransactions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const qBudgets = query(collection(db, 'budgets'), where('userId', '==', user.uid));
    const unsubBudgets = onSnapshot(qBudgets, (snapshot) => {
      setBudgets(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const qGoals = query(collection(db, 'goals'), where('userId', '==', user.uid));
    const unsubGoals = onSnapshot(qGoals, (snapshot) => {
      setGoals(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubTx();
      unsubBudgets();
      unsubGoals();
    };
  }, [user]);

  useEffect(() => {
    if (!user && localTransactions.length > 0) {
      localStorage.setItem('finai_local_tx', JSON.stringify(localTransactions));
    }
  }, [localTransactions, user]);

  const displayTransactions = user ? transactions : localTransactions;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    toast.info("Extracting text from PDF...");

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const typedarray = new Uint8Array(reader.result as ArrayBuffer);
        const pdf = await pdfjsLib.getDocument(typedarray).promise;
        let fullText = "";
        
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map((item: any) => item.str).join(" ");
          fullText += pageText + "\n";
        }

        toast.info("AI is parsing transactions...");
        const parsedTx = await parseBankStatement(fullText);
        
        if (user) {
          for (const tx of parsedTx) {
            await addDoc(collection(db, 'transactions'), {
              ...tx,
              userId: user.uid,
              date: new Date(tx.date).toISOString(),
              aiCategorized: true
            });
          }
        } else {
          const newLocal = [...parsedTx.map(tx => ({ ...tx, id: Math.random().toString(36).substr(2, 9), date: new Date(tx.date).toISOString(), aiCategorized: true })), ...localTransactions];
          setLocalTransactions(newLocal);
        }

        toast.success(`Successfully imported ${parsedTx.length} transactions!`);
      };
      reader.readAsArrayBuffer(file);
    } catch (error) {
      console.error(error);
      toast.error("Failed to parse PDF statement");
    } finally {
      setIsUploading(false);
    }
  };

  // Form states
  const [txDesc, setTxDesc] = useState("");
  const [txAmount, setTxAmount] = useState("");
  const [txType, setTxType] = useState("expense");
  const [txCategory, setTxCategory] = useState("Other");

  // Goal states
  const [goalName, setGoalName] = useState("");
  const [goalTarget, setGoalTarget] = useState("");

  const handleAddGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goalName || !goalTarget) return;

    try {
      const goalData = {
        name: goalName,
        targetAmount: parseFloat(goalTarget),
        currentAmount: 0,
        createdAt: new Date().toISOString()
      };

      if (user) {
        await addDoc(collection(db, 'goals'), {
          ...goalData,
          userId: user.uid
        });
      } else {
        const newGoals = [...goals, { ...goalData, id: Math.random().toString(36).substr(2, 9) }];
        setGoals(newGoals);
        localStorage.setItem('finai_local_goals', JSON.stringify(newGoals));
      }

      setGoalName("");
      setGoalTarget("");
      setShowAddGoal(false);
      toast.success("Goal created successfully!");
    } catch (error) {
      console.error(error);
      toast.error("Failed to create goal");
    }
  };

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!txAmount || !txDesc) return;

    setIsAnalyzing(true);
    try {
      let category = txCategory;
      let aiCategorized = false;

      // AI Categorization if "Other" or explicitly requested
      if (category === "Other") {
        const analysis = await analyzeTransaction(txDesc, parseFloat(txAmount));
        category = analysis.category;
        aiCategorized = true;
        toast.success(`AI categorized this as ${category}`);
      }

      const txData = {
        description: txDesc,
        amount: parseFloat(txAmount),
        type: txType,
        category,
        aiCategorized,
        date: new Date().toISOString()
      };

      if (user) {
        await addDoc(collection(db, 'transactions'), {
          ...txData,
          userId: user.uid
        });
      } else {
        setLocalTransactions([{ ...txData, id: Math.random().toString(36).substr(2, 9) }, ...localTransactions]);
      }

      setTxDesc("");
      setTxAmount("");
      setShowAddTx(false);
      toast.success("Transaction added!");
    } catch (error) {
      console.error(error);
      toast.error("Failed to add transaction");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getAiInsights = async () => {
    if (displayTransactions.length === 0) {
      toast.info("Add some transactions first!");
      return;
    }
    setIsAnalyzing(true);
    try {
      const advice = await getFinancialAdvice(displayTransactions, budgets, goals);
      setAiAdvice(advice);
    } catch (error) {
      toast.error("AI is busy right now. Try again later.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const totalBalance = displayTransactions.reduce((acc, tx) => {
    return tx.type === 'income' ? acc + tx.amount : acc - tx.amount;
  }, 0);

  const monthlySpending = displayTransactions
    .filter(tx => tx.type === 'expense')
    .reduce((acc, tx) => acc + tx.amount, 0);

  const categoryData = CATEGORIES.map(cat => ({
    name: cat,
    value: displayTransactions
      .filter(tx => tx.type === 'expense' && tx.category === cat)
      .reduce((acc, tx) => acc + tx.amount, 0)
  })).filter(d => d.value > 0);

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans">
      {/* Sidebar / Nav */}
      <nav className="fixed left-0 top-0 h-full w-20 md:w-64 bg-white border-r border-gray-200 z-50 flex flex-col">
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white">
            <Wallet size={24} />
          </div>
          <span className="hidden md:block font-bold text-xl tracking-tight">FinAI</span>
        </div>
        
        <div className="flex-1 px-4 space-y-2 mt-4">
          <NavItem 
            icon={<LayoutDashboard size={20} />} 
            label="Dashboard" 
            active={activeTab === "dashboard"} 
            onClick={() => setActiveTab("dashboard")}
          />
          <NavItem 
            icon={<TrendingUp size={20} />} 
            label="Analytics" 
            active={activeTab === "analytics"} 
            onClick={() => setActiveTab("analytics")}
          />
          <NavItem 
            icon={<Target size={20} />} 
            label="Goals" 
            active={activeTab === "goals"} 
            onClick={() => setActiveTab("goals")}
          />
          <NavItem 
            icon={<BrainCircuit size={20} />} 
            label="AI Advisor" 
            active={activeTab === "ai-advisor"} 
            onClick={() => setActiveTab("ai-advisor")}
          />
        </div>

        <div className="p-4 border-t border-gray-100">
          {user ? (
            <Button variant="ghost" className="w-full justify-start gap-3 text-gray-500 hover:text-red-600" onClick={logout}>
              <LogOut size={20} />
              <span className="hidden md:block">Logout</span>
            </Button>
          ) : (
            <Button variant="ghost" className="w-full justify-start gap-3 text-indigo-600 hover:bg-indigo-50" onClick={login}>
              <LogIn size={20} />
              <span className="hidden md:block">Login to Sync</span>
            </Button>
          )}
        </div>
      </nav>

      {/* Main Content */}
      <main className="ml-20 md:ml-64 p-4 md:p-8">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold">
              {user ? `Welcome back, ${user?.displayName?.split(' ')[0]}` : "Welcome to FinAI"}
            </h1>
            <p className="text-gray-500">
              {user ? "Here's what's happening with your money today." : "Start tracking your finances locally or login to sync."}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <input 
                type="file" 
                accept=".pdf" 
                className="absolute inset-0 opacity-0 cursor-pointer" 
                onChange={handleFileUpload}
                disabled={isUploading}
              />
              <Button variant="outline" disabled={isUploading} className="border-indigo-200 text-indigo-600 hover:bg-indigo-50">
                <FileUp size={20} className="mr-2" /> {isUploading ? "Uploading..." : "Upload Statement"}
              </Button>
            </div>
            <Button onClick={() => setShowAddTx(true)} className="bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200">
              <Plus size={20} className="mr-2" /> Add Transaction
            </Button>
          </div>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <StatCard 
            title="Total Balance" 
            value={`$${totalBalance.toLocaleString()}`} 
            trend="+2.4%" 
            icon={<Wallet className="text-indigo-600" />} 
          />
          <StatCard 
            title="Monthly Spending" 
            value={`$${monthlySpending.toLocaleString()}`} 
            trend="-12%" 
            negative 
            icon={<ArrowDownRight className="text-rose-600" />} 
          />
          <StatCard 
            title="Savings Rate" 
            value="32%" 
            trend="+5%" 
            icon={<TrendingUp className="text-emerald-600" />} 
          />
        </div>

        {/* Tab Content */}
        {activeTab === "dashboard" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main Charts Area */}
            <div className="lg:col-span-2 space-y-8">
              <Card className="border-none shadow-sm">
                <CardHeader>
                  <CardTitle>Spending Overview</CardTitle>
                  <CardDescription>Your expenses categorized by AI</CardDescription>
                </CardHeader>
                <CardContent className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={categoryData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} />
                      <YAxis axisLine={false} tickLine={false} />
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      />
                      <Bar dataKey="value" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="border-none shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Recent Transactions</CardTitle>
                    <CardDescription>Your latest financial activities</CardDescription>
                  </div>
                  <Button variant="outline" size="sm">View All</Button>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px] pr-4">
                    <div className="space-y-4">
                      {displayTransactions.map((tx) => (
                        <div key={tx.id} className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-xl transition-colors">
                          <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${tx.type === 'income' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                              {tx.type === 'income' ? <ArrowUpRight size={20} /> : <ArrowDownRight size={20} />}
                            </div>
                            <div>
                              <p className="font-semibold">{tx.description}</p>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-500">{format(new Date(tx.date), 'MMM dd, yyyy')}</span>
                                <Badge variant="secondary" className="text-[10px] py-0 px-1.5 h-4">
                                  {tx.category}
                                </Badge>
                                {tx.aiCategorized && (
                                  <Sparkles size={12} className="text-indigo-500" />
                                )}
                              </div>
                            </div>
                          </div>
                          <p className={`font-bold ${tx.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {tx.type === 'income' ? '+' : '-'}${tx.amount.toLocaleString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>

            {/* Sidebar Area */}
            <div className="space-y-8">
              {/* Quick AI Advisor Card */}
              <Card className="border-none bg-indigo-900 text-white overflow-hidden relative">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                  <BrainCircuit size={120} />
                </div>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="text-yellow-400" /> AI Financial Advisor
                  </CardTitle>
                  <CardDescription className="text-indigo-200">Personalized insights powered by Gemini</CardDescription>
                </CardHeader>
                <CardContent>
                  {aiAdvice ? (
                    <div className="text-sm leading-relaxed space-y-4">
                      {aiAdvice.split('\n').slice(0, 3).map((line, i) => (
                        <p key={i}>{line}</p>
                      ))}
                      <Button variant="secondary" className="w-full mt-4" onClick={() => setActiveTab("ai-advisor")}>
                        View Full Advice
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <p className="text-sm text-indigo-100">Get personalized advice based on your spending habits and goals.</p>
                      <Button 
                        onClick={getAiInsights} 
                        disabled={isAnalyzing}
                        className="w-full bg-white text-indigo-900 hover:bg-indigo-50"
                      >
                        {isAnalyzing ? "Analyzing..." : "Generate Insights"}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Goals Card */}
              <Card className="border-none shadow-sm">
                <CardHeader>
                  <CardTitle>Financial Goals</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {goals.length > 0 ? goals.map(goal => (
                    <div key={goal.id} className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">{goal.name}</span>
                        <span className="text-gray-500">${goal.currentAmount} / ${goal.targetAmount}</span>
                      </div>
                      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-indigo-600 rounded-full" 
                          style={{ width: `${Math.min((goal.currentAmount / goal.targetAmount) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  )) : (
                    <div className="text-center py-8 text-gray-400">
                      <Target size={40} className="mx-auto mb-2 opacity-20" />
                      <p className="text-sm">No goals set yet</p>
                    </div>
                  )}
                  <Button variant="outline" className="w-full border-dashed" onClick={() => setActiveTab("goals")}>
                    <Plus size={16} className="mr-2" /> New Goal
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {activeTab === "analytics" && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <Card className="border-none shadow-sm">
                <CardHeader>
                  <CardTitle>Spending by Category</CardTitle>
                  <CardDescription>Visual breakdown of your expenses</CardDescription>
                </CardHeader>
                <CardContent className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryData}
                        cx="50%"
                        cy="50%"
                        innerRadius={80}
                        outerRadius={120}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {categoryData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="border-none shadow-sm">
                <CardHeader>
                  <CardTitle>Income vs Expenses</CardTitle>
                  <CardDescription>Monthly comparison</CardDescription>
                </CardHeader>
                <CardContent className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[
                      { name: 'Income', amount: displayTransactions.filter(t => t.type === 'income').reduce((a, b) => a + b.amount, 0) },
                      { name: 'Expenses', amount: displayTransactions.filter(t => t.type === 'expense').reduce((a, b) => a + b.amount, 0) }
                    ]}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                        <Cell fill="#10b981" />
                        <Cell fill="#f43f5e" />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {activeTab === "goals" && (
          <div className="space-y-8">
            <Card className="border-none shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Your Financial Goals</CardTitle>
                  <CardDescription>Track your progress towards big milestones</CardDescription>
                </div>
                <Button className="bg-indigo-600" onClick={() => setShowAddGoal(true)}>
                  <Plus size={20} className="mr-2" /> Add New Goal
                </Button>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {goals.map(goal => (
                    <Card key={goal.id} className="border border-gray-100 shadow-none">
                      <CardContent className="p-6">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <h3 className="font-bold text-lg">{goal.name}</h3>
                            <p className="text-sm text-gray-500">Target: ${goal.targetAmount}</p>
                          </div>
                          <Badge className="bg-indigo-50 text-indigo-600 border-none">
                            {Math.round((goal.currentAmount / goal.targetAmount) * 100)}%
                          </Badge>
                        </div>
                        <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden mb-4">
                          <div 
                            className="h-full bg-indigo-600 rounded-full transition-all duration-500" 
                            style={{ width: `${Math.min((goal.currentAmount / goal.targetAmount) * 100, 100)}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Saved: ${goal.currentAmount}</span>
                          <span className="font-medium text-indigo-600">Remaining: ${goal.targetAmount - goal.currentAmount}</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {goals.length === 0 && (
                    <div className="col-span-full text-center py-20 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
                      <Target size={48} className="mx-auto mb-4 text-gray-300" />
                      <h3 className="text-lg font-medium text-gray-900">No goals yet</h3>
                      <p className="text-gray-500 mb-6">Set your first financial goal to start tracking progress.</p>
                      <Button variant="outline" className="border-indigo-200 text-indigo-600" onClick={() => setShowAddGoal(true)}>
                        Create Your First Goal
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === "ai-advisor" && (
          <div className="max-w-4xl mx-auto space-y-8">
            <Card className="border-none bg-indigo-900 text-white p-8 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-10">
                <BrainCircuit size={200} />
              </div>
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 bg-white/10 rounded-2xl backdrop-blur-md">
                    <Sparkles className="text-yellow-400" size={32} />
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold">AI Financial Advisor</h2>
                    <p className="text-indigo-200">Personalized wealth-building strategies</p>
                  </div>
                </div>
                
                {aiAdvice ? (
                  <div className="prose prose-invert max-w-none">
                    <div className="bg-white/5 rounded-2xl p-6 backdrop-blur-sm border border-white/10">
                      {aiAdvice.split('\n').map((line, i) => (
                        <p key={i} className="mb-4 text-indigo-50 leading-relaxed">
                          {line}
                        </p>
                      ))}
                    </div>
                    <Button 
                      onClick={getAiInsights} 
                      disabled={isAnalyzing}
                      className="mt-8 bg-white text-indigo-900 hover:bg-indigo-50"
                    >
                      {isAnalyzing ? "Analyzing..." : "Refresh Advice"}
                    </Button>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <p className="text-xl text-indigo-100 mb-8">
                      Let Gemini analyze your spending patterns and goals to provide professional financial guidance.
                    </p>
                    <Button 
                      onClick={getAiInsights} 
                      disabled={isAnalyzing}
                      size="lg"
                      className="bg-white text-indigo-900 hover:bg-indigo-50 h-14 px-8 text-lg font-bold"
                    >
                      {isAnalyzing ? "Processing Data..." : "Generate My Financial Plan"}
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          </div>
        )}
      </main>

      {/* Add Transaction Modal */}
      <AnimatePresence>
        {showAddTx && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddTx(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl p-6"
            >
              <h2 className="text-2xl font-bold mb-6">Add Transaction</h2>
              <form onSubmit={handleAddTransaction} className="space-y-4">
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input 
                    placeholder="e.g. Grocery Shopping" 
                    value={txDesc} 
                    onChange={e => setTxDesc(e.target.value)}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Amount</Label>
                    <Input 
                      type="number" 
                      placeholder="0.00" 
                      value={txAmount} 
                      onChange={e => setTxAmount(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <div className="flex p-1 bg-gray-100 rounded-lg">
                      <button
                        type="button"
                        onClick={() => setTxType("expense")}
                        className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${txType === "expense" ? "bg-white text-rose-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                      >
                        Expense
                      </button>
                      <button
                        type="button"
                        onClick={() => setTxType("income")}
                        className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${txType === "income" ? "bg-white text-emerald-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                      >
                        Income
                      </button>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={txCategory} onValueChange={setTxCategory}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(cat => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-gray-400">Select "Other" to let AI categorize automatically.</p>
                </div>
                <div className="pt-4 flex gap-3">
                  <Button type="button" variant="ghost" className="flex-1" onClick={() => setShowAddTx(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isAnalyzing} className="flex-1 bg-indigo-600">
                    {isAnalyzing ? "Analyzing..." : "Save Transaction"}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Goal Modal */}
      <AnimatePresence>
        {showAddGoal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddGoal(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl p-6"
            >
              <h2 className="text-2xl font-bold mb-6">Create New Goal</h2>
              <form onSubmit={handleAddGoal} className="space-y-4">
                <div className="space-y-2">
                  <Label>Goal Name</Label>
                  <Input 
                    placeholder="e.g. New Car, Emergency Fund" 
                    value={goalName} 
                    onChange={e => setGoalName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Target Amount</Label>
                  <Input 
                    type="number" 
                    placeholder="0.00" 
                    value={goalTarget} 
                    onChange={e => setGoalTarget(e.target.value)}
                    required
                  />
                </div>
                <div className="pt-4 flex gap-3">
                  <Button type="button" variant="ghost" className="flex-1" onClick={() => setShowAddGoal(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" className="flex-1 bg-indigo-600">
                    Create Goal
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <Toaster position="bottom-right" />
    </div>
  );
}

function NavItem({ icon, label, active = false, onClick }: { icon: React.ReactNode, label: string, active?: boolean, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${active ? 'bg-indigo-50 text-indigo-600' : 'text-gray-500 hover:bg-gray-50'}`}
    >
      {icon}
      <span className="hidden md:block font-medium">{label}</span>
    </button>
  );
}

function StatCard({ title, value, trend, icon, negative = false }: { title: string, value: string, trend: string, icon: React.ReactNode, negative?: boolean }) {
  return (
    <Card className="border-none shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-6">
        <div className="flex justify-between items-start mb-4">
          <div className="p-2 bg-gray-50 rounded-lg">
            {icon}
          </div>
          <Badge variant="secondary" className={`text-xs ${negative ? 'text-rose-600 bg-rose-50' : 'text-emerald-600 bg-emerald-50'}`}>
            {trend}
          </Badge>
        </div>
        <p className="text-sm text-gray-500 mb-1">{title}</p>
        <h3 className="text-2xl font-bold">{value}</h3>
      </CardContent>
    </Card>
  );
}

function LoginScreen() {
  const { login } = useAuth();
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA] p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full text-center"
      >
        <div className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center text-white mx-auto mb-8 shadow-2xl shadow-indigo-200">
          <Wallet size={40} />
        </div>
        <h1 className="text-4xl font-bold mb-4 tracking-tight">FinAI</h1>
        <p className="text-gray-500 mb-12 text-lg">Your AI-powered personal finance companion. Track, predict, and grow your wealth.</p>
        
        <div className="space-y-4">
          <Button onClick={login} size="lg" className="w-full bg-white text-gray-900 border border-gray-200 hover:bg-gray-50 h-14 text-lg shadow-sm">
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-6 h-6 mr-3" alt="Google" />
            Continue with Google
          </Button>
          <p className="text-xs text-gray-400">Secure authentication powered by Firebase</p>
        </div>

        <div className="mt-16 grid grid-cols-3 gap-4">
          <Feature icon={<Sparkles className="text-indigo-500" />} label="AI Tracking" />
          <Feature icon={<BrainCircuit className="text-indigo-500" />} label="Smart Advice" />
          <Feature icon={<Target className="text-indigo-500" />} label="Goal Focused" />
        </div>
      </motion.div>
    </div>
  );
}

function Feature({ icon, label }: { icon: React.ReactNode, label: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="p-3 bg-white rounded-2xl shadow-sm border border-gray-100">
        {icon}
      </div>
      <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400">{label}</span>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  // Login is now optional, show dashboard even if not logged in
  return <Dashboard />;
}
