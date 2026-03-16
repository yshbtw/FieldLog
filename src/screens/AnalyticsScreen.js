import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions, TouchableOpacity, Modal, Alert } from 'react-native';
import { BarChart } from 'react-native-chart-kit';
import { useWorkSession } from '../context/WorkSessionContext';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { formatCurrency } from '../utils/formatTime';

const screenWidth = Dimensions.get('window').width;

export default function AnalyticsScreen() {
  const { getContactTotals, getWeeklyTotals, getMonthlyEarnings, sessions, contactRates, getEarningsForSession } = useWorkSession();

  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [exportRange, setExportRange] = useState('All Time'); // 'All Time', 'Today', 'This Week', 'This Month'

  const { weekData, totalWeeklyEarnings } = getWeeklyTotals();
  const monthlyEarnings = getMonthlyEarnings();
  const contactTotals = getContactTotals().sort((a, b) => b.totalEarnings - a.totalEarnings);

  const chartConfig = {
    backgroundColor: '#FFFFFF',
    backgroundGradientFrom: '#FFFFFF',
    backgroundGradientTo: '#FFFFFF',
    color: (opacity = 1) => `rgba(37, 99, 235, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(107, 114, 128, ${opacity})`,
    strokeWidth: 2,
    barPercentage: 0.6,
    decimalPlaces: 1,
    propsForBackgroundLines: {
      strokeWidth: 0, 
    },
    fillShadowGradient: '#3B82F6',
    fillShadowGradientOpacity: 1,
    style: {
      borderRadius: 24,
    },
  };

  // Chart-kit bugs out if max is zero
  const hasData = weekData.some(val => val > 0 && !isNaN(val));
  const safeData = hasData ? weekData.map(v => isNaN(v) ? 0 : v) : [0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01];

  const data = {
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    datasets: [{ data: safeData }],
  };

  // --- REPORT GENERATION PREP ---
  const getFilteredSessions = () => {
    const now = new Date();
    let filterDate = new Date(0); // All time

    if (exportRange === 'Today') {
      filterDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (exportRange === 'This Week') {
      const dayOfWeek = now.getDay();
      const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      filterDate = new Date(now);
      filterDate.setDate(now.getDate() - daysSinceMonday);
      filterDate.setHours(0, 0, 0, 0);
    } else if (exportRange === 'This Month') {
      filterDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    return sessions.filter(s => new Date(s.startTime) >= filterDate);
  };

  const generateReportData = () => {
    const filtered = getFilteredSessions();
    return filtered.map(s => {
      const rate = contactRates[s.contactId] || 0;
      const earnings = getEarningsForSession(s);
      const start = new Date(s.startTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      const end = new Date(s.endTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      const hours = (s.duration / 3600).toFixed(2);

      return {
        Contact: s.contactName,
        Date: s.date,
        'Start Time': start,
        'End Time': end,
        'Duration (hrs)': hours,
        Rate: `$${rate}/hr`,
        Earnings: formatCurrency(earnings),
        Description: s.description,
      };
    });
  };

  // --- EXCEL EXPORT ---
  const handleExportExcel = async () => {
    try {
      const dataRows = generateReportData();
      if (dataRows.length === 0) return Alert.alert("No Data", `No sessions found for ${exportRange}.`);

      const ws = XLSX.utils.json_to_sheet(dataRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Work Sessions");

      const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      const filename = `WorkTime_Report_${exportRange.replace(' ', '_')}.xlsx`;
      const fileUri = FileSystem.documentDirectory + filename;

      await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
      await Sharing.shareAsync(fileUri, { UTI: 'com.microsoft.excel.xls', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      
      setExportModalVisible(false);
    } catch (err) {
      console.error(err);
      Alert.alert("Export Error", "Failed to generate Excel report.");
    }
  };

  // --- PDF EXPORT ---
  const handleExportPDF = async () => {
    try {
      const dataRows = generateReportData();
      if (dataRows.length === 0) return Alert.alert("No Data", `No sessions found for ${exportRange}.`);

      let tableRows = dataRows.map(row => `
        <tr>
          <td>${row.Contact}</td>
          <td>${row.Date}</td>
          <td>${row['Duration (hrs)']}</td>
          <td>${row.Earnings}</td>
          <td>${row.Description}</td>
        </tr>
      `).join('');

      const totalEarnings = dataRows.reduce((sum, row) => {
         const floatVal = parseFloat(row.Earnings.replace(/[^0-9.-]+/g, ''));
         return sum + (isNaN(floatVal) ? 0 : floatVal);
      }, 0);
      const totalHours = dataRows.reduce((sum, row) => sum + parseFloat(row['Duration (hrs)']), 0);

      const html = `
        <html>
          <head>
            <style>
              body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 20px; color: #333; }
              h1 { color: #0F172A; }
              p { color: #64748B; margin-bottom: 20px; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
              th, td { border: 1px solid #CBD5E1; padding: 12px; text-align: left; }
              th { background-color: #F1F5F9; color: #0F172A; }
              .summary { margin-top: 20px; padding: 20px; background-color: #F8FAFC; border-radius: 8px; }
              .summary h3 { margin: 0 0 10px 0; }
            </style>
          </head>
          <body>
            <h1>WorkTime Tracker Report</h1>
            <p><strong>Timeframe:</strong> ${exportRange}</p>
            <table>
              <tr>
                <th>Contact</th>
                <th>Date</th>
                <th>Hours</th>
                <th>Earnings</th>
                <th>Description</th>
              </tr>
              ${tableRows}
            </table>
            <div class="summary">
              <h3>Summary</h3>
              <p><strong>Total Hours:</strong> ${totalHours.toFixed(2)} hrs</p>
              <p><strong>Total Earnings:</strong> ${formatCurrency(totalEarnings)}</p>
            </div>
          </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
      
      setExportModalVisible(false);
    } catch (err) {
      console.error(err);
      Alert.alert("Export Error", "Failed to generate PDF report.");
    }
  };

  return (
    <View style={{flex: 1, backgroundColor: '#F2F2F7'}}>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Analytics</Text>
          <TouchableOpacity style={styles.exportButton} onPress={() => setExportModalVisible(true)}>
            <Text style={styles.exportButtonText}>📥 Export Report</Text>
          </TouchableOpacity>
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

        {/* Weekly Chart */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Weekly Hours Summary</Text>
          <View style={styles.chartContainer}>
            <BarChart
              data={data}
              width={screenWidth - 48}
              height={260}
              yAxisLabel=""
              yAxisSuffix="h"
              chartConfig={chartConfig}
              verticalLabelRotation={0}
              showValuesOnTopOfBars={true}
              fromZero={true}
              withInnerLines={false}
              segments={4}
              style={styles.chart}
            />
          </View>
        </View>

        {/* Per Contact Totals */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Totals Per Contact</Text>
          
          {contactTotals.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No data available yet.</Text>
            </View>
          ) : (
            contactTotals.map(contact => (
              <View key={contact.contactId} style={styles.contactRow}>
                <View style={styles.contactInfo}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{contact.contactName?.[0]?.toUpperCase() || '?'}</Text>
                  </View>
                  <Text style={styles.contactName}>{contact.contactName}</Text>
                </View>
                
                <View style={styles.contactStats}>
                  <Text style={styles.contactHours}>
                    {(contact.totalSeconds / 3600).toFixed(1)} hrs
                  </Text>
                  <Text style={styles.contactEarnings}>
                    {formatCurrency(contact.totalEarnings)}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>
        
        <View style={styles.bottomPadding} />
      </ScrollView>

      {/* Export Options Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={exportModalVisible}
        onRequestClose={() => setExportModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Generate Report</Text>
            
            <Text style={styles.filterLabel}>Timeframe</Text>
            <View style={styles.rangeRow}>
              {['All Time', 'This Month', 'This Week', 'Today'].map(range => (
                <TouchableOpacity 
                  key={range} 
                  style={[styles.rangeBadge, exportRange === range && styles.rangeBadgeActive]}
                  onPress={() => setExportRange(range)}
                >
                  <Text style={[styles.rangeText, exportRange === range && styles.rangeTextActive]}>{range}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setExportModalVisible(false)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <View style={styles.exportActionGroup}>
                <TouchableOpacity style={[styles.exportActionButton, styles.excelButton]} onPress={handleExportExcel}>
                  <Text style={styles.exportActionButtonText}>Excel (.xlsx)</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.exportActionButton, styles.pdfButton]} onPress={handleExportPDF}>
                  <Text style={styles.exportActionButtonText}>PDF</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#111827',
  },
  exportButton: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  exportButtonText: {
    color: '#4F46E5',
    fontWeight: '700',
    fontSize: 14,
  },
  summaryContainer: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    gap: 16,
    marginBottom: 32,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 3,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
    fontWeight: '600',
  },
  summaryValue: {
    fontSize: 26,
    fontWeight: '800',
    color: '#2563EB',
  },
  section: {
    paddingHorizontal: 24,
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 16,
  },
  chartContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingVertical: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 3,
    alignItems: 'center',
    overflow: 'hidden',
  },
  chart: {
    borderRadius: 24,
    paddingRight: 16,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  contactInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  contactName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
  },
  contactStats: {
    alignItems: 'flex-end',
  },
  contactHours: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
    fontWeight: '500',
  },
  contactEarnings: {
    fontSize: 16,
    fontWeight: '800',
    color: '#16A34A',
  },
  emptyContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  emptyText: {
    color: '#6B7280',
    fontSize: 16,
    fontWeight: '500',
  },
  bottomPadding: {
    height: 100, // padding for floating tab bar
  },

  /* Modal Styles */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#F2F2F7',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 28,
    paddingBottom: 48,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 20,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 24,
  },
  filterLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#6B7280',
    marginBottom: 12,
  },
  rangeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 40,
  },
  rangeBadge: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  rangeBadgeActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#4F46E5',
    borderWidth: 1,
  },
  rangeText: {
    color: '#6B7280',
    fontWeight: '600',
    fontSize: 15,
  },
  rangeTextActive: {
    color: '#4F46E5',
    fontWeight: '700',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  exportActionGroup: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButtonText: {
    color: '#6B7280',
    fontWeight: '700',
    fontSize: 16,
  },
  exportActionButton: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 16,
  },
  excelButton: {
    backgroundColor: '#16A34A', // Green for Excel
  },
  pdfButton: {
    backgroundColor: '#EF4444', // Red for PDF
  },
  exportActionButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
});
