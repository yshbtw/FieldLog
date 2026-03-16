import React, { createContext, useContext, useState, useEffect } from 'react';
import { loadSessions, saveSessions } from '../services/storageService';

const WorkSessionContext = createContext(null);

export function WorkSessionProvider({ children }) {
  const [sessions, setSessions] = useState([]);

  // Global Timer State (persists across screens)
  const [timerState, setTimerState] = useState({
    status: 'idle', // 'idle' | 'running' | 'paused'
    startTime: null, // Date.now() when started/resumed
    accumulatedTime: 0, // total ms elapsed in past runs
    contact: null, // { id: string, name: string }
  });

  // Load initial sessions from storage
  useEffect(() => {
    loadSessions().then(data => setSessions(data || []));
  }, []);

  // Features required: Add new session
  const addSession = async (session) => {
    const newSessions = [session, ...sessions];
    setSessions(newSessions);
    await saveSessions(newSessions);
  };

  // Features required: Delete session
  const deleteSession = async (sessionId) => {
    const newSessions = sessions.filter(s => s.id !== sessionId);
    setSessions(newSessions);
    await saveSessions(newSessions);
  };

  // Features required: Update/edit session
  const updateSession = async (sessionId, updatedFields) => {
    const newSessions = sessions.map(s => 
      s.id === sessionId ? { ...s, ...updatedFields } : s
    );
    setSessions(newSessions);
    await saveSessions(newSessions);
  };

  // Features required: Get sessions by contact
  const getSessionsByContact = (contactId) => {
    return sessions.filter(s => s.contactId === contactId);
  };

  // Features required: Get sessions by date
  // Expects dateString format like 'YYYY-MM-DD'
  const getSessionsByDate = (dateString) => {
    return sessions.filter(s => s.date.startsWith(dateString));
  };

  // --- BILLING & ANALYTICS HELPER FUNCTIONS ---

  // Total Hours and Earnings per Contact
  const getContactTotals = () => {
    const totals = {};
    sessions.forEach(session => {
      const { contactId, contactName, duration, totalEarnings } = session;
      if (!totals[contactId]) {
        totals[contactId] = {
          contactId,
          contactName,
          totalSeconds: 0,
          totalEarnings: 0,
        };
      }
      totals[contactId].totalSeconds += duration;
      totals[contactId].totalEarnings += (totalEarnings || 0);
    });
    return Object.values(totals);
  };

  // Weekly Summary (Hours worked in the current week)
  const getWeeklyTotals = () => {
    // Determine the start of the week (Monday)
    const now = new Date();
    const dayOfWeek = now.getDay();
    const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // 0=Sunday
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - daysSinceMonday);
    startOfWeek.setHours(0, 0, 0, 0);

    const weekData = [0, 0, 0, 0, 0, 0, 0]; // Mon-Sun (hours)
    let totalWeeklyEarnings = 0;

    sessions.forEach(session => {
      const sessionDate = new Date(session.startTime);
      if (sessionDate >= startOfWeek) {
        // Find which day of the week it is (0=Mon, 6=Sun)
        let sessionDay = sessionDate.getDay() - 1;
        if (sessionDay === -1) sessionDay = 6; // Sunday
        
        const hours = session.duration / 3600;
        weekData[sessionDay] += hours;
        totalWeeklyEarnings += (session.totalEarnings || 0);
      }
    });

    return { weekData, totalWeeklyEarnings };
  };

  // Monthly Summary (Earnings for current month)
  const getMonthlyEarnings = () => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    let totalMonthlyEarnings = 0;
    sessions.forEach(session => {
      const sessionDate = new Date(session.startTime);
      if (sessionDate >= startOfMonth) {
        totalMonthlyEarnings += (session.totalEarnings || 0);
      }
    });
    return totalMonthlyEarnings;
  };

  const value = {
    sessions,
    addSession,
    deleteSession,
    updateSession,
    getSessionsByContact,
    getSessionsByDate,
    timerState,
    setTimerState,
    getContactTotals,
    getWeeklyTotals,
    getMonthlyEarnings,
  };

  return (
    <WorkSessionContext.Provider value={value}>
      {children}
    </WorkSessionContext.Provider>
  );
}

export function useWorkSession() {
  const context = useContext(WorkSessionContext);
  if (!context) {
    throw new Error('useWorkSession must be used within a WorkSessionProvider');
  }
  return context;
}
