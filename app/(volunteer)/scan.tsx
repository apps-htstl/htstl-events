// app/(volunteer)/scan.tsx
// QR Code Scanner Screen — CameraView for native, getUserMedia + jsQR for web.
// Platform.OS checks handle the branching; no separate route file needed.

import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Alert,
  TextInput,
  Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app, db } from '@/lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { HTSLEvent } from '@/lib/types';
import { updateRegistration } from '@/lib/firestore';
// @ts-ignore — jsqr ships its own types
import jsQR from 'jsqr';

export default function ScanScreen() {
  const { appUser, logout } = useAuth();

  // ── Native camera permission (unused on web) ────────────────────────────────
  const [permission, requestPermission] = useCameraPermissions();

  // ── Web camera DOM refs ─────────────────────────────────────────────────────
  const containerRef   = useRef<any>(null);
  const videoElRef     = useRef<HTMLVideoElement | null>(null);
  const canvasElRef    = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef   = useRef<number | null>(null);
  const streamRef      = useRef<MediaStream | null>(null);
  // Use refs in the rAF loop to avoid stale closures
  const scannedRef     = useRef(false);
  const processingRef  = useRef(false);
  const handlerRef     = useRef<(arg: { data: string }) => void>(() => {});

  type WebCamState = 'requesting' | 'active' | 'denied' | 'error';
  const [webCamState, setWebCamState] = useState<WebCamState>('requesting');

  // Event selection states
  const [events, setEvents] = useState<HTSLEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<HTSLEvent | null>(null);
  const [showEventPicker, setShowEventPicker] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(false);

  // Scanning states (native only — web uses scannedRef)
  const [scanned, setScanned] = useState(false);
  const [isProcessingScan, setIsProcessingScan] = useState(false);

  // Check-in modal states
  const [checkInModalVisible, setCheckInModalVisible] = useState(false);
  const [checkInData, setCheckInData] = useState<{
    regId: string;
    code: string;
    attendeeName: string;
    email: string;
    phone: string;
    tier: string;
    partySize: number;
    checkedInCount: number;
    token: string;
  } | null>(null);
  const [partyCount, setPartyCount] = useState(1);
  const [checkInSubmitting, setCheckInSubmitting] = useState(false);

  // Edit & Resend states
  const [editMode, setEditMode] = useState(false);
  const [editedEmail, setEditedEmail] = useState('');
  const [editedPhone, setEditedPhone] = useState('');
  const [isSendingTicket, setIsSendingTicket] = useState(false);

  // Load active events for volunteer's org
  const loadActiveEvents = async () => {
    if (!appUser?.orgId) return;
    try {
      setEventsLoading(true);
      const q = query(
        collection(db, 'orgs', appUser.orgId, 'events'),
        where('status', '==', 'active')
      );
      const snap = await getDocs(q);
      const activeEvents = snap.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          orgId: data.orgId,
          name: data.name,
          date: data.date?.toDate(),
          venue: data.venue,
          status: data.status,
          tiers: data.tiers || [],
          sections: data.sections || [],
          createdBy: data.createdBy,
          createdAt: data.createdAt?.toDate(),
        } as HTSLEvent;
      });

      setEvents(activeEvents);
      if (activeEvents.length > 0 && !selectedEvent) {
        setSelectedEvent(activeEvents[0]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setEventsLoading(false);
    }
  };

  useEffect(() => {
    loadActiveEvents();
  }, [appUser?.orgId]);

  // ── Barcode scan handler ───────────────────────────────────────────────────────────
  const handleBarcodeScanned = useCallback(async ({ data }: { data: string }) => {
    // Use refs on web (rAF loop), state on native
    const alreadyScanned = Platform.OS === 'web' ? scannedRef.current : scanned;
    if (alreadyScanned || processingRef.current || !selectedEvent || !appUser?.orgId) return;
    if (Platform.OS === 'web') { scannedRef.current = true; processingRef.current = true; }

    try {
      setScanned(true);
      setIsProcessingScan(true);

      const functions = getFunctions(app);
      const checkInCallable = httpsCallable<{
        token: string;
        orgId: string;
        eventId: string;
        partyCount: number;
      }, any>(functions, 'validateAndCheckIn');

      const res = await checkInCallable({
        token: data,
        orgId: appUser.orgId,
        eventId: selectedEvent.id,
        partyCount: 0,
      });

      const outcome = res.data;
      
      setCheckInData({
        regId: outcome.regId,
        code: outcome.code,
        attendeeName: outcome.attendeeName,
        email: outcome.email || '',
        phone: outcome.phone || '',
        tier: outcome.tier,
        partySize: outcome.partySize,
        checkedInCount: outcome.checkedInCount,
        token: data,
      });

      setEditedEmail(outcome.email || '');
      setEditedPhone(outcome.phone || '');
      setEditMode(false);

      const remaining = outcome.partySize - outcome.checkedInCount;
      setPartyCount(Math.max(1, remaining));
      setCheckInModalVisible(true);
    } catch (err: any) {
      console.error(err);
      Alert.alert('Scan Failed', err?.message || 'Invalid ticket code.');
      setScanned(false);
      if (Platform.OS === 'web') scannedRef.current = false;
    } finally {
      if (Platform.OS === 'web') processingRef.current = false;
      setIsProcessingScan(false);
    }
  }, [scanned, selectedEvent, appUser?.orgId]);

  useEffect(() => {
    handlerRef.current = handleBarcodeScanned;
  }, [handleBarcodeScanned]);

  // ── Web camera: getUserMedia + rAF scan loop (runs once on mount) ─────────────────
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    let cancelled = false;

    const startCamera = async () => {
      try {
        const stream = await (navigator as any).mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (cancelled) { stream.getTracks().forEach((t: MediaStreamTrack) => t.stop()); return; }
        streamRef.current = stream;

        const container = containerRef.current as HTMLDivElement | null;
        if (!container) { stream.getTracks().forEach((t: MediaStreamTrack) => t.stop()); return; }

        const video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true;
        video.setAttribute('style', 'position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;');
        container.appendChild(video);
        videoElRef.current = video;

        const canvas = document.createElement('canvas');
        canvas.style.display = 'none';
        document.body.appendChild(canvas);
        canvasElRef.current = canvas;

        await video.play();
        setWebCamState('active');

        const scanLoop = () => {
          if (!cancelled && (video.readyState as number) >= 4) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(video, 0, 0);
              const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const code = jsQR(imgData.data, imgData.width, imgData.height, { inversionAttempts: 'dontInvert' });
              if (code?.data) handlerRef.current({ data: code.data });
            }
          }
          if (!cancelled) animFrameRef.current = requestAnimationFrame(scanLoop);
        };
        animFrameRef.current = requestAnimationFrame(scanLoop);
      } catch (err: any) {
        if (cancelled) return;
        console.error('Camera error:', err);
        setWebCamState(err?.name === 'NotAllowedError' ? 'denied' : 'error');
      }
    };

    startCamera();

    return () => {
      cancelled = true;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
      if (videoElRef.current?.parentNode) videoElRef.current.parentNode.removeChild(videoElRef.current);
      if (canvasElRef.current?.parentNode) canvasElRef.current.parentNode.removeChild(canvasElRef.current);
    };
  }, []);

  const submitCheckIn = async () => {
    if (!checkInData || !selectedEvent || !appUser?.orgId) return;

    try {
      setCheckInSubmitting(true);
      const functions = getFunctions(app);
      const checkInCallable = httpsCallable<{
        token: string;
        orgId: string;
        eventId: string;
        partyCount: number;
      }, any>(functions, 'validateAndCheckIn');

      const res = await checkInCallable({
        token: checkInData.token,
        orgId: appUser.orgId,
        eventId: selectedEvent.id,
        partyCount,
      });

      if (res.data.success || res.data.code === 'SUCCESS') {
        Alert.alert('Checked In', `${checkInData.attendeeName} +${partyCount} checked in successfully!`);
      } else {
        Alert.alert('Alert', res.data.message || 'Check-in failed');
      }

      setCheckInModalVisible(false);
      setCheckInData(null);
      setScanned(false);
      scannedRef.current = false;
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to complete check-in.');
    } finally {
      setCheckInSubmitting(false);
    }
  };

  const handleResendTicket = async (targetChannel: 'email' | 'sms') => {
    if (!checkInData || !appUser?.orgId || !selectedEvent) return;

    try {
      setIsSendingTicket(true);

      // 1. If details changed, save them to Firestore first
      const hasEmailChanged = editedEmail.trim() !== (checkInData.email || '');
      const hasPhoneChanged = editedPhone.trim() !== (checkInData.phone || '');

      if (hasEmailChanged || hasPhoneChanged) {
        await updateRegistration(appUser.orgId, selectedEvent.id, checkInData.regId, {
          email: editedEmail.trim(),
          phone: editedPhone.trim(),
        });
      }

      // 2. Call Cloud Function to dispatch the ticket
      const functions = getFunctions(app);
      const sendTicketsCallable = httpsCallable<{
        orgId: string;
        eventId: string;
        registrantIds: string[];
        channel: 'email' | 'sms' | 'both';
      }, {
        success: boolean;
        count: number;
        failed: number;
        errors?: string[];
      }>(functions, 'sendTickets');

      const res = await sendTicketsCallable({
        orgId: appUser.orgId,
        eventId: selectedEvent.id,
        registrantIds: [checkInData.regId],
        channel: targetChannel,
      });

      if (res.data.failed > 0) {
        const errorDetails = res.data.errors?.join('\n') || 'Failed to dispatch ticket.';
        Alert.alert('Dispatch Warning', errorDetails);
      } else {
        Alert.alert('Success', `Ticket sent via ${targetChannel.toUpperCase()} successfully!`);
        setEditMode(false);
      }
    } catch (err: any) {
      console.error(err);
      Alert.alert('Error', err?.message || 'Failed to send ticket.');
    } finally {
      setIsSendingTicket(false);
    }
  };

  // ── Native permission guards (skipped on web) ────────────────────────────────
  if (Platform.OS !== 'web') {
    if (!permission) {
      return (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#059669" />
        </View>
      );
    }
    if (!permission.granted) {
      return (
        <View style={styles.permissionContainer}>
          <Ionicons name="camera-outline" size={72} color="#D1D5DB" />
          <Text style={styles.permissionTitle}>Camera Access Required</Text>
          <Text style={styles.permissionText}>
            RegiCheck needs camera permission to scan attendee QR codes.
          </Text>
          <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
            <Text style={styles.permissionBtnText}>Grant Permission</Text>
          </TouchableOpacity>
        </View>
      );
    }
  }

  // ── Web camera permission denied / error states ───────────────────────────
  if (Platform.OS === 'web' && webCamState === 'denied') {
    return (
      <SafeAreaView style={styles.permissionContainer}>
        <Ionicons name="camera-off-outline" size={72} color="#D1D5DB" />
        <Text style={styles.permissionTitle}>Camera Access Blocked</Text>
        <Text style={styles.permissionText}>
          Click the camera icon in your browser address bar, allow access, then refresh.
        </Text>
      </SafeAreaView>
    );
  }
  if (Platform.OS === 'web' && webCamState === 'error') {
    return (
      <SafeAreaView style={styles.permissionContainer}>
        <Ionicons name="alert-circle-outline" size={72} color="#D1D5DB" />
        <Text style={styles.permissionTitle}>Camera Unavailable</Text>
        <Text style={styles.permissionText}>
          Could not start your camera. Make sure no other app is using it, then refresh.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Banner / Event Selector */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.eventSelector}
          onPress={() => {
            loadActiveEvents();
            setShowEventPicker(true);
          }}
        >
          <Ionicons name="calendar" size={18} color="#059669" />
          <Text style={styles.eventNameText} numberOfLines={1}>
            {selectedEvent ? selectedEvent.name : 'Select Event'}
          </Text>
          <Ionicons name="chevron-down" size={14} color="#6B7280" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
          <Ionicons name="log-out-outline" size={20} color="#6B7280" />
        </TouchableOpacity>
      </View>

      {/* Scanner View — web uses DOM-injected <video>, native uses CameraView */}
      {selectedEvent ? (
        <View style={styles.scannerWrapper}>
          {Platform.OS === 'web' ? (
            // Web: containerRef <div> receives an imperative <video> element
            <View ref={containerRef} style={StyleSheet.absoluteFillObject} />
          ) : (
            // Native: expo-camera
            <CameraView
              style={StyleSheet.absoluteFillObject}
              facing="back"
              onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
            />
          )}
          {/* Overlay scanning target */}
          <View style={styles.overlay} pointerEvents="none">
            {Platform.OS === 'web' && webCamState === 'requesting' ? (
              <ActivityIndicator size="large" color="#FFF" />
            ) : (
              <>
                <View style={styles.scanBox}>
                  <View style={[styles.corner, styles.topLeft]} />
                  <View style={[styles.corner, styles.topRight]} />
                  <View style={[styles.corner, styles.bottomLeft]} />
                  <View style={[styles.corner, styles.bottomRight]} />
                  {isProcessingScan && <ActivityIndicator size="large" color="#FFF" />}
                </View>
                <Text style={styles.scanInstructions}>
                  Align attendee QR ticket code inside the box
                </Text>
              </>
            )}
          </View>
        </View>
      ) : (
        <View style={styles.noEventsContainer}>
          <Ionicons name="alert-circle-outline" size={64} color="#9CA3AF" />
          <Text style={styles.noEventsTitle}>No Active Events</Text>
          <Text style={styles.noEventsText}>
            Ask an admin to publish/activate the event in order to start check-in scanning.
          </Text>
          <TouchableOpacity style={styles.refreshBtn} onPress={loadActiveEvents}>
            <Text style={styles.refreshBtnText}>Refresh list</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* EVENT PICKER MODAL */}
      <Modal visible={showEventPicker} animationType="slide" transparent>
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerContainer}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Select Event</Text>
              <TouchableOpacity onPress={() => setShowEventPicker(false)}>
                <Ionicons name="close" size={24} color="#374151" />
              </TouchableOpacity>
            </View>

            {eventsLoading ? (
              <ActivityIndicator style={{ margin: 24 }} color="#059669" />
            ) : events.length === 0 ? (
              <Text style={styles.noEventsPicker}>No active events available.</Text>
            ) : (
              events.map((evt) => (
                <TouchableOpacity
                  key={evt.id}
                  style={[
                    styles.pickerItem,
                    selectedEvent?.id === evt.id && styles.pickerItemActive,
                  ]}
                  onPress={() => {
                    setSelectedEvent(evt);
                    setShowEventPicker(false);
                  }}
                >
                  <Text style={styles.pickerItemText}>{evt.name}</Text>
                  <Text style={styles.pickerItemVenue}>{evt.venue}</Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        </View>
      </Modal>

      {/* CHECK-IN CONFIRMATION MODAL */}
      <Modal visible={checkInModalVisible} animationType="slide" transparent>
        <View style={styles.pickerOverlay}>
          <View style={styles.confirmContainer}>
            {checkInData && (
              <View style={{ gap: 16 }}>
                <Text style={styles.confirmHeader}>Confirm Entrance</Text>

                <View style={styles.attendeeProfileCard}>
                  <Text style={styles.attendeeName}>{checkInData.attendeeName}</Text>
                  <View style={styles.tierBadge}>
                    <Text style={styles.tierBadgeText}>{checkInData.tier.toUpperCase()}</Text>
                  </View>

                  {/* Email & Phone Details / Edit Mode */}
                  {!editMode ? (
                    <View style={styles.contactDetails}>
                      <Text style={styles.contactLabel}>
                        Email: <Text style={styles.contactValue}>{checkInData.email || 'Not provided'}</Text>
                      </Text>
                      <Text style={styles.contactLabel}>
                        Phone: <Text style={styles.contactValue}>{checkInData.phone || 'Not provided'}</Text>
                      </Text>
                      <TouchableOpacity 
                        style={styles.editContactBtn} 
                        onPress={() => {
                          setEditedEmail(checkInData.email || '');
                          setEditedPhone(checkInData.phone || '');
                          setEditMode(true);
                        }}
                      >
                        <Ionicons name="create-outline" size={14} color="#059669" />
                        <Text style={styles.editContactText}>Edit Details / Send Ticket</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.editContactForm}>
                      <View style={styles.modalInputGroup}>
                        <Text style={styles.modalInputLabel}>Email Address</Text>
                        <TextInput
                          style={styles.modalTextInput}
                          value={editedEmail}
                          onChangeText={setEditedEmail}
                          placeholder="Email address"
                          keyboardType="email-address"
                          autoCapitalize="none"
                        />
                      </View>
                      <View style={styles.modalInputGroup}>
                        <Text style={styles.modalInputLabel}>Phone Number</Text>
                        <TextInput
                          style={styles.modalTextInput}
                          value={editedPhone}
                          onChangeText={setEditedPhone}
                          placeholder="Phone number"
                          keyboardType="phone-pad"
                        />
                      </View>
                      <View style={styles.editActionsRow}>
                        <TouchableOpacity
                          style={[styles.resendBtn, isSendingTicket && styles.resendBtnDisabled]}
                          onPress={() => handleResendTicket('email')}
                          disabled={isSendingTicket}
                        >
                          <Ionicons name="mail-outline" size={16} color="#FFF" />
                          <Text style={styles.resendBtnText}>Email Ticket</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.resendBtn, isSendingTicket && styles.resendBtnDisabled]}
                          onPress={() => handleResendTicket('sms')}
                          disabled={isSendingTicket}
                        >
                          <Ionicons name="phone-portrait-outline" size={16} color="#FFF" />
                          <Text style={styles.resendBtnText}>SMS Ticket</Text>
                        </TouchableOpacity>
                      </View>
                      <TouchableOpacity 
                        style={styles.cancelEditBtn} 
                        onPress={() => setEditMode(false)}
                      >
                        <Text style={styles.cancelEditText}>Cancel Edit</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>

                {/* Checked in stats */}
                <View style={styles.confirmStatsRow}>
                  <Text style={styles.confirmStatsLabel}>Group Size:</Text>
                  <Text style={styles.confirmStatsValue}>{checkInData.partySize}</Text>
                </View>
                <View style={styles.confirmStatsRow}>
                  <Text style={styles.confirmStatsLabel}>Checked In So Far:</Text>
                  <Text style={styles.confirmStatsValue}>{checkInData.checkedInCount}</Text>
                </View>

                {/* Conditional flow: Already checked in vs Check-in entry */}
                {checkInData.checkedInCount >= checkInData.partySize ? (
                  <View style={styles.warningBox}>
                    <Ionicons name="warning" size={20} color="#991B1B" />
                    <Text style={styles.warningText}>
                      ALREADY CHECKED IN: Every member of this group has checked in. Do not admit.
                    </Text>
                  </View>
                ) : (
                  <View style={styles.checkinActionBox}>
                    <Text style={styles.selectCountLabel}>Guests present now:</Text>
                    <View style={styles.countControls}>
                      <TouchableOpacity
                        style={styles.countBtn}
                        onPress={() => setPartyCount(Math.max(1, partyCount - 1))}
                      >
                        <Ionicons name="remove" size={20} color="#374151" />
                      </TouchableOpacity>
                      <Text style={styles.countVal}>{partyCount}</Text>
                      <TouchableOpacity
                        style={styles.countBtn}
                        onPress={() =>
                          setPartyCount(
                            Math.min(checkInData.partySize - checkInData.checkedInCount, partyCount + 1)
                          )
                        }
                      >
                        <Ionicons name="add" size={20} color="#374151" />
                      </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                      style={styles.confirmBtn}
                      onPress={submitCheckIn}
                      disabled={checkInSubmitting}
                    >
                      {checkInSubmitting ? (
                        <ActivityIndicator color="#FFF" />
                      ) : (
                        <Text style={styles.confirmBtnText}>Admit {partyCount} Guest(s)</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                )}

                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => {
                    setCheckInModalVisible(false);
                    setCheckInData(null);
                    setScanned(false);
                  }}
                >
                  <Text style={styles.cancelBtnText}>Cancel / Close</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  eventSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#D1FAE5',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 38,
    gap: 8,
    flex: 1,
    marginRight: 12,
  },
  eventNameText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#065F46',
    flex: 1,
  },
  logoutBtn: {
    padding: 8,
  },
  scannerWrapper: {
    flex: 1,
    position: 'relative',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  scanBox: {
    width: 250,
    height: 250,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: 'transparent',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  corner: {
    width: 20,
    height: 20,
    borderColor: '#059669',
    position: 'absolute',
  },
  topLeft: {
    top: -2,
    left: -2,
    borderTopWidth: 4,
    borderLeftWidth: 4,
  },
  topRight: {
    top: -2,
    right: -2,
    borderTopWidth: 4,
    borderRightWidth: 4,
  },
  bottomLeft: {
    bottom: -2,
    left: -2,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
  },
  bottomRight: {
    bottom: -2,
    right: -2,
    borderBottomWidth: 4,
    borderRightWidth: 4,
  },
  scanInstructions: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 24,
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFF',
    padding: 40,
    gap: 16,
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  permissionText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  permissionBtn: {
    backgroundColor: '#059669',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  permissionBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
  },
  noEventsContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFF',
    padding: 40,
    gap: 16,
  },
  noEventsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#374151',
  },
  noEventsText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  refreshBtn: {
    backgroundColor: '#059669',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  refreshBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  pickerContainer: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    gap: 16,
    maxHeight: '70%',
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 8,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  noEventsPicker: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginVertical: 20,
  },
  pickerItem: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  pickerItemActive: {
    backgroundColor: '#F0FDF4',
  },
  pickerItemText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  pickerItemVenue: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  confirmContainer: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    gap: 16,
  },
  confirmHeader: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
  },
  attendeeProfileCard: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    gap: 8,
  },
  attendeeName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
  },
  tierBadge: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  tierBadgeText: {
    color: '#0369A1',
    fontSize: 11,
    fontWeight: '800',
  },
  confirmStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  confirmStatsLabel: {
    fontSize: 14,
    color: '#4B5563',
    fontWeight: '500',
  },
  confirmStatsValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 12,
    padding: 14,
    gap: 10,
    marginVertical: 8,
  },
  warningText: {
    flex: 1,
    color: '#991B1B',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  checkinActionBox: {
    alignItems: 'center',
    gap: 12,
    marginVertical: 8,
  },
  selectCountLabel: {
    fontSize: 14,
    color: '#4B5563',
    fontWeight: '600',
  },
  countControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  countBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  countVal: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
  },
  confirmBtn: {
    backgroundColor: '#059669',
    borderRadius: 12,
    height: 48,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  confirmBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  cancelBtnText: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '600',
  },
  contactDetails: {
    width: '100%',
    marginTop: 8,
    gap: 4,
    alignItems: 'center',
  },
  contactLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  contactValue: {
    fontWeight: '600',
    color: '#374151',
  },
  editContactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#ECFDF5',
  },
  editContactText: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '700',
  },
  editContactForm: {
    width: '100%',
    gap: 10,
    marginTop: 8,
  },
  modalInputGroup: {
    gap: 4,
    width: '100%',
  },
  modalInputLabel: {
    fontSize: 11,
    color: '#4B5563',
    fontWeight: '600',
  },
  modalTextInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    height: 38,
    paddingHorizontal: 10,
    fontSize: 13,
    color: '#111827',
    width: '100%',
  },
  editActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
    width: '100%',
  },
  resendBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#059669',
    borderRadius: 8,
    height: 38,
  },
  resendBtnDisabled: {
    backgroundColor: '#A7F3D0',
  },
  resendBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  cancelEditBtn: {
    alignItems: 'center',
    paddingVertical: 4,
    marginTop: 4,
  },
  cancelEditText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '700',
  },
});
