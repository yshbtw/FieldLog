import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions, TouchableOpacity, Modal, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWorkSession } from '../context/WorkSessionContext';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { formatCurrency } from '../utils/formatTime';

const screenWidth = Dimensions.get('window').width;

// Helper: format date as dd-mm-yyyy
function formatDateDDMMYYYY(dateInput) {
  const d = dateInput ? new Date(dateInput) : new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

export default function AnalyticsScreen() {
  const insets = useSafeAreaInsets();
  const { getContactTotals, getWeeklyTotals, getMonthlyEarnings, sessions, updateSession } = useWorkSession();

  const [selectedContact, setSelectedContact] = useState(null);
  const [selectedSessionIds, setSelectedSessionIds] = useState(new Set());

  const { weekData, totalWeeklyEarnings } = getWeeklyTotals();
  const monthlyEarnings = getMonthlyEarnings();
  
  // Group sessions by contact
  const groupedContacts = useMemo(() => {
    const groups = {};
    const totals = getContactTotals();
    totals.forEach(t => {
      groups[t.contactId] = { ...t, sessions: [] };
    });
    sessions.forEach(session => {
      if (groups[session.contactId]) {
        groups[session.contactId].sessions.push(session);
      }
    });
    const sortedGroups = Object.values(groups).sort((a, b) => b.totalEarnings - a.totalEarnings);
    sortedGroups.forEach(g => {
      g.sessions.sort((a, b) => new Date(b.date) - new Date(a.date));
    });
    return sortedGroups;
  }, [sessions]);

  // Keep selectedContact in sync with live session data
  const liveSelectedContact = useMemo(() => {
    if (!selectedContact) return null;
    return groupedContacts.find(g => g.contactId === selectedContact.contactId) || null;
  }, [selectedContact, groupedContacts]);

  // Open detail modal
  const openContactDetail = (contactGroup) => {
    setSelectedContact(contactGroup);
    setSelectedSessionIds(new Set()); // reset selection
  };

  // Toggle session selection
  const toggleSessionSelection = (sessionId) => {
    setSelectedSessionIds(prev => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  };

  // Select All / Deselect All
  const toggleSelectAll = () => {
    if (!liveSelectedContact) return;
    if (selectedSessionIds.size === liveSelectedContact.sessions.length) {
      setSelectedSessionIds(new Set());
    } else {
      setSelectedSessionIds(new Set(liveSelectedContact.sessions.map(s => s.id)));
    }
  };

  // Get payment status counts for a contact
  const getStatusCounts = (contactGroup) => {
    let paid = 0, partial = 0, unpaid = 0;
    contactGroup.sessions.forEach(s => {
      if (s.paidStatus === 'paid') paid++;
      else if (s.paidStatus === 'partial') partial++;
      else unpaid++;
    });
    return { paid, partial, unpaid };
  };

  // --- EXPORT SELECTED SESSIONS PDF ---
  const handleExportSelectedPDF = async (contactGroup) => {
    try {
      const selectedSessions = contactGroup.sessions.filter(s => selectedSessionIds.has(s.id));
      
      if (selectedSessions.length === 0) {
        return Alert.alert("No Selection", "Please select at least one session to export.");
      }

      let totalEarningsSum = 0;
      let totalPaidSum = 0;
      let totalHours = 0;

      let sessionRows = selectedSessions.map((s, idx) => {
        const hours = s.duration / 3600;
        totalEarningsSum += (s.totalEarnings || 0);
        totalPaidSum += (s.paidAmount || 0);
        totalHours += hours;
        const roundNum = selectedSessions.length - idx;
        const statusLabel = s.paidStatus === 'paid' ? 'Paid' : s.paidStatus === 'partial' ? 'Partial' : 'Unpaid';
        const statusEmoji = s.paidStatus === 'paid' ? '✅' : s.paidStatus === 'partial' ? '🟡' : '🔴';
        const partialNote = s.paidStatus === 'partial' ? `<br/><small style="color: #64748B;">Rec: ${formatCurrency(s.paidAmount || 0)}</small>` : '';
        return `
          <tr>
            <td>Round ${roundNum}</td>
            <td>${s.date}</td>
            <td>${hours.toFixed(2)} hrs</td>
            <td>${formatCurrency(s.totalEarnings)}</td>
            <td>${statusEmoji} ${statusLabel}${partialNote}</td>
            <td>${s.description || '-'}</td>
          </tr>
        `;
      }).join('');

      const remainingBalance = totalEarningsSum - totalPaidSum;

      const html = `
        <html>
          <head>
            <style>
              body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 20px; color: #333; }
              h1 { color: #0F172A; margin-bottom: 5px; }
              p { color: #64748B; margin-bottom: 15px; margin-top: 5px; }
              h2 { color: #4F46E5; font-size: 18px; border-bottom: 2px solid #E0E7FF; padding-bottom: 5px; margin-bottom: 15px;}
              table { width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 14px;}
              th, td { border: 1px solid #CBD5E1; padding: 10px; text-align: left; }
              th { background-color: #F8FAFC; color: #475569; font-weight: bold;}
              .overall-summary { margin-top: 30px; padding: 20px; background-color: #F8FAFC; border-radius: 8px; border: 1px solid #E5E7EB;}
              .overall-summary h3 { margin: 0 0 10px 0; color: #1E293B; font-size: 16px;}
              .summary-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 15px; }
              .grand-total { margin-top: 20px; padding: 15px 20px; background-color: #EEF2FF; border-radius: 8px; border: 1px solid #C7D2FE; }
              .total-item { margin-bottom: 15px; text-align: right; }
              .total-item:last-child { margin-bottom: 0; }
              .total-label { color: #4F46E5; font-weight: bold; font-size: 12px; text-transform: uppercase; margin-bottom: 4px; }
              .total-value { color: #1E293B; font-size: 20px; font-weight: bold; }
              .balance-value { color: #EF4444; font-size: 24px; font-weight: bold; }
              .paid-value { color: #16A34A; font-size: 24px; font-weight: bold; }
            </style>
          </head>
          <body>
            <h1>WorkTime Tracker Report</h1>
            <p><strong>Contact:</strong> ${contactGroup.contactName}</p>
            <p><strong>Generated:</strong> ${formatDateDDMMYYYY()}</p>
            
            <h2>Selected Sessions (${selectedSessions.length})</h2>
            <table>
              <tr>
                <th>Session</th>
                <th>Date</th>
                <th>Duration</th>
                <th>Earnings</th>
                <th>Status</th>
                <th>Description</th>
              </tr>
              ${sessionRows}
            </table>

            <div class="overall-summary">
              <h3>Report Summary</h3>
              <div class="summary-row">
                <span>Total Work Hours:</span>
                <strong>${totalHours.toFixed(2)} hrs</strong>
              </div>
              <div class="summary-row">
                <span>Total Gross Earnings:</span>
                <strong>${formatCurrency(totalEarningsSum)}</strong>
              </div>
            </div>

            <div class="grand-total">
               <div style="display: flex; justify-content: space-between;">
                  <div class="total-item" style="text-align: left;">
                    <div class="total-label">Total Paid</div>
                    <div class="total-value paid-value">${formatCurrency(totalPaidSum)}</div>
                  </div>
                  <div class="total-item">
                    <div class="total-label">Remaining Balance</div>
                    <div class="total-value balance-value">${formatCurrency(remainingBalance)}</div>
                  </div>
               </div>
            </div>
          </body>
        </html>
      `;

      const safeName = (contactGroup.contactName || 'Contact').replace(/[^a-zA-Z0-9]/g, '_');
      const dateStr = formatDateDDMMYYYY();
      const fileName = `${safeName}_${dateStr}.pdf`;

      const { uri } = await Print.printToFileAsync({ html });
      const newUri = FileSystem.cacheDirectory + fileName;
      await FileSystem.moveAsync({ from: uri, to: newUri });
      await Sharing.shareAsync(newUri, { UTI: '.pdf', mimeType: 'application/pdf' });
      
    } catch (err) {
      console.error(err);
      Alert.alert("Export Error", "Failed to generate PDF report.");
    }
  };


  return (
    <View style={{flex: 1, backgroundColor: '#F2F2F7'}}>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <Text style={styles.headerTitle}>Analytics</Text>
          <Text style={styles.headerSubtitle}>Your work insights and reports</Text>
        </View>

        {/* Summary Cards */}
        <View style={styles.summaryContainer}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Weekly Earnings</Text>
            <Text style={styles.summaryValue}>{formatCurrency(totalWeeklyEarnings)}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Monthly Earnings</Text>
            <Text style={styles.summaryValue}>{formatCurrency(monthlyEarnings)}</Text>
          </View>
        </View>

        {/* Clickable Contact Cards */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contacts</Text>
          
          {groupedContacts.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No data available yet.</Text>
            </View>
          ) : (
            groupedContacts.map(contactGroup => {
              const counts = getStatusCounts(contactGroup);
              return (
                <TouchableOpacity 
                  key={contactGroup.contactId} 
                  style={styles.contactCard}
                  activeOpacity={0.7}
                  onPress={() => openContactDetail(contactGroup)}
                >
                  <View style={styles.contactCardLeft}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>
                        {contactGroup.contactName?.[0]?.toUpperCase() || '?'}
                      </Text>
                    </View>
                    <View style={styles.contactCardInfo}>
                      <Text style={styles.contactName}>{contactGroup.contactName}</Text>
                      <Text style={styles.contactMeta}>
                        {contactGroup.sessions.length} session{contactGroup.sessions.length !== 1 ? 's' : ''} · {(contactGroup.totalSeconds / 3600).toFixed(1)} hrs
                      </Text>
                      {/* Payment Status Summary */}
                      <View style={styles.statusRow}>
                        {counts.paid > 0 && <Text style={styles.statusPaid}>{counts.paid} paid</Text>}
                        {counts.partial > 0 && <Text style={styles.statusPartial}>{counts.partial} partial</Text>}
                        {counts.unpaid > 0 && <Text style={styles.statusUnpaid}>{counts.unpaid} unpaid</Text>}
                      </View>
                    </View>
                  </View>
                  <View style={styles.contactCardRight}>
                    <Text style={styles.contactEarnings}>{formatCurrency(contactGroup.totalEarnings)}</Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>


        <View style={styles.bottomPadding} />
      </ScrollView>

      {/* ===== DETAIL MODAL ===== */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={!!liveSelectedContact}
        onRequestClose={() => setSelectedContact(null)}
      >
        <View style={styles.detailOverlay}>
          <View style={styles.detailContent}>
            {liveSelectedContact && (
              <>
                {/* Modal Header */}
                <View style={styles.detailHeader}>
                  <View style={styles.detailHeaderLeft}>
                    <View style={[styles.avatar, { width: 48, height: 48, borderRadius: 24 }]}>
                      <Text style={[styles.avatarText, { fontSize: 20 }]}>
                        {liveSelectedContact.contactName?.[0]?.toUpperCase() || '?'}
                      </Text>
                    </View>
                    <View style={{ marginLeft: 14 }}>
                      <Text style={styles.detailName}>{liveSelectedContact.contactName}</Text>
                      <Text style={styles.detailSubInfo}>
                        {(liveSelectedContact.totalSeconds / 3600).toFixed(1)} hrs · {formatCurrency(liveSelectedContact.totalEarnings)}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => setSelectedContact(null)} style={styles.closeBtn}>
                    <Text style={styles.closeBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>

                {/* Select All / Count Bar */}
                <View style={styles.selectionBar}>
                  <TouchableOpacity onPress={toggleSelectAll} style={styles.selectAllBtn}>
                    <View style={[
                      styles.checkbox,
                      selectedSessionIds.size === liveSelectedContact.sessions.length && styles.checkboxChecked
                    ]}>
                      {selectedSessionIds.size === liveSelectedContact.sessions.length && (
                        <Text style={styles.checkmark}>✓</Text>
                      )}
                    </View>
                    <Text style={styles.selectAllText}>
                      {selectedSessionIds.size === liveSelectedContact.sessions.length ? 'Deselect All' : 'Select All'}
                    </Text>
                  </TouchableOpacity>
                  <Text style={styles.selectionCount}>
                    {selectedSessionIds.size} selected
                  </Text>
                </View>

                {/* Sessions List with Checkboxes */}
                <ScrollView style={styles.detailList} showsVerticalScrollIndicator={false}>
                  {liveSelectedContact.sessions.map((session, index) => {
                    const roundNum = liveSelectedContact.sessions.length - index;
                    const hours = (session.duration / 3600).toFixed(2);
                    const status = session.paidStatus || 'unpaid';
                    const isSelected = selectedSessionIds.has(session.id);

                    return (
                      <TouchableOpacity 
                        key={session.id} 
                        style={[styles.detailRow, isSelected && styles.detailRowSelected]}
                        activeOpacity={0.7}
                        onPress={() => toggleSessionSelection(session.id)}
                      >
                        {/* Checkbox */}
                        <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                          {isSelected && <Text style={styles.checkmark}>✓</Text>}
                        </View>

                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <View style={styles.detailRowTop}>
                            <Text style={styles.roundText}>Round {roundNum}</Text>
                            <View style={[
                              styles.statusBadge,
                              status === 'paid' ? styles.statusBadgePaid :
                              status === 'partial' ? styles.statusBadgePartial :
                              styles.statusBadgeUnpaid
                            ]}>
                              <Text style={[
                                styles.statusBadgeText,
                                status === 'paid' ? styles.statusBadgeTextPaid :
                                status === 'partial' ? styles.statusBadgeTextPartial :
                                styles.statusBadgeTextUnpaid
                              ]}>
                                {status === 'paid' ? '✅ Paid' : 
                                 status === 'partial' ? `🟡 ₹${session.paidAmount || 0}` : 
                                 '🔴 Unpaid'}
                              </Text>
                            </View>
                          </View>
                          <Text style={styles.detailDate}>{session.date}</Text>
                          {session.description ? (
                            <Text style={styles.detailDesc} numberOfLines={1}>{session.description}</Text>
                          ) : null}
                        </View>
                        <View style={styles.detailNumbers}>
                          <Text style={styles.detailHours}>{hours} hrs</Text>
                          <Text style={styles.detailEarnings}>
                            {formatCurrency(session.totalEarnings)}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                  <View style={{ height: 20 }} />
                </ScrollView>

                {/* Export Selected Button */}
                <TouchableOpacity 
                  style={[styles.exportBtn, selectedSessionIds.size === 0 && styles.exportBtnDisabled]}
                  onPress={() => handleExportSelectedPDF(liveSelectedContact)}
                  disabled={selectedSessionIds.size === 0}
                >
                  <Text style={styles.exportBtnText}>
                    📥 Export {selectedSessionIds.size > 0 ? `${selectedSessionIds.size} Session${selectedSessionIds.size > 1 ? 's' : ''}` : 'Selected'} as PDF
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  header: { paddingHorizontal: 24, paddingBottom: 8 },
  headerTitle: { fontSize: 32, fontWeight: '800', color: '#111827', marginBottom: 4 },
  headerSubtitle: { fontSize: 15, color: '#6B7280', fontWeight: '500' },

  // Summary
  summaryContainer: { flexDirection: 'row', paddingHorizontal: 24, gap: 16, marginBottom: 32 },
  summaryCard: {
    flex: 1, backgroundColor: '#FFFFFF', borderRadius: 24, padding: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.05, shadowRadius: 16, elevation: 3,
  },
  summaryLabel: { fontSize: 14, color: '#6B7280', marginBottom: 8, fontWeight: '600' },
  summaryValue: { fontSize: 26, fontWeight: '800', color: '#2563EB' },

  // Section
  section: { paddingHorizontal: 24, marginBottom: 32 },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: '#111827', marginBottom: 16 },

  // Compact Contact Card
  contactCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 12, elevation: 2,
  },
  contactCardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatar: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#4F46E5',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  contactCardInfo: { marginLeft: 14, flex: 1 },
  contactName: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 2 },
  contactMeta: { fontSize: 13, color: '#9CA3AF', fontWeight: '500', marginBottom: 4 },
  contactCardRight: { alignItems: 'flex-end', marginLeft: 12 },
  contactEarnings: { fontSize: 16, fontWeight: '800', color: '#10B981' },

  // Status Row on Contact Cards
  statusRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  statusPaid: { fontSize: 11, color: '#16A34A', fontWeight: '700' },
  statusPartial: { fontSize: 11, color: '#CA8A04', fontWeight: '700' },
  statusUnpaid: { fontSize: 11, color: '#EF4444', fontWeight: '700' },

  // Empty
  emptyContainer: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 32, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  emptyText: { color: '#6B7280', fontSize: 16, fontWeight: '500' },

  bottomPadding: { height: 120 },

  // ===== DETAIL MODAL =====
  detailOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  detailContent: {
    backgroundColor: '#F2F2F7', borderTopLeftRadius: 32, borderTopRightRadius: 32,
    maxHeight: '85%', paddingBottom: 32,
  },
  detailHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 24, borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  detailHeaderLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  detailName: { fontSize: 20, fontWeight: '800', color: '#111827' },
  detailSubInfo: { fontSize: 14, color: '#6B7280', fontWeight: '500', marginTop: 2 },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#F3F4F6',
    alignItems: 'center', justifyContent: 'center',
  },
  closeBtnText: { fontSize: 18, color: '#6B7280', fontWeight: '600' },

  // Selection Bar
  selectionBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 24, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  selectAllBtn: { flexDirection: 'row', alignItems: 'center' },
  selectAllText: { fontSize: 14, fontWeight: '700', color: '#4F46E5', marginLeft: 10 },
  selectionCount: { fontSize: 13, color: '#6B7280', fontWeight: '600' },

  // Checkbox
  checkbox: {
    width: 24, height: 24, borderRadius: 8, borderWidth: 2, borderColor: '#D1D5DB',
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF',
  },
  checkboxChecked: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
  checkmark: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },

  // Detail Session List
  detailList: { paddingHorizontal: 24, paddingTop: 12 },
  detailRow: {
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, marginBottom: 10,
    flexDirection: 'row', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 8, elevation: 1,
  },
  detailRowSelected: { borderWidth: 2, borderColor: '#4F46E5', backgroundColor: '#FAFAFF' },
  detailRowTop: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4,
  },
  roundText: { fontSize: 15, fontWeight: '700', color: '#374151' },
  detailDate: { fontSize: 13, color: '#9CA3AF', fontWeight: '500', marginBottom: 2 },
  detailDesc: { fontSize: 12, color: '#6B7280', fontStyle: 'italic' },
  detailNumbers: { alignItems: 'flex-end', marginLeft: 12 },
  detailHours: { fontSize: 14, fontWeight: '600', color: '#4B5563', marginBottom: 4 },
  detailEarnings: { fontSize: 15, fontWeight: '800', color: '#10B981' },

  // Status Badge in modal
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusBadgePaid: { backgroundColor: '#DCFCE7' },
  statusBadgePartial: { backgroundColor: '#FEF9C3' },
  statusBadgeUnpaid: { backgroundColor: '#FEE2E2' },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  statusBadgeTextPaid: { color: '#16A34A' },
  statusBadgeTextPartial: { color: '#CA8A04' },
  statusBadgeTextUnpaid: { color: '#EF4444' },

  // Export Button
  exportBtn: {
    backgroundColor: '#4F46E5', marginHorizontal: 24, paddingVertical: 16,
    borderRadius: 20, alignItems: 'center',
  },
  exportBtnDisabled: { backgroundColor: '#D1D5DB' },
  exportBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
});
