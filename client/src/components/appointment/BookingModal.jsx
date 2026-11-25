import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import confetti from 'canvas-confetti';
import {
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  X,
  CreditCard,
  FileText,
  MapPin,
  QrCode,
  Smartphone,
  Landmark,
  Wallet,
} from 'lucide-react';
import { availabilityAPI, appointmentAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import qrCodeImg from '../../assets/qr.jpeg';

export default function BookingModal({ doctor, isOpen, onClose, onBookingSuccess }) {
  const { user, isAuthenticated } = useAuth();
  const { fetchNotifications } = useNotifications();

  const [upcomingDays, setUpcomingDays] = useState([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [availabilityData, setAvailabilityData] = useState(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [symptoms, setSymptoms] = useState('');
  const [notes, setNotes] = useState('');
  const [shiftFilter, setShiftFilter] = useState('All'); // 'All', 'Morning', 'Evening'
  const [bookingLoading, setBookingLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [bookingSuccessData, setBookingSuccessData] = useState(null);

  // Payment States
  const [paymentMethod, setPaymentMethod] = useState('qr'); // 'qr', 'upi', 'card', 'netbanking'
  const [upiId, setUpiId] = useState('');
  const [transactionRef, setTransactionRef] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardName, setCardName] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [selectedBank, setSelectedBank] = useState('SBI');

  // Initialize next 7 days and strict shift when doctor is selected
  useEffect(() => {
    if (isOpen && doctor) {
      setErrorMessage('');
      setBookingSuccessData(null);
      setSelectedSlot('');
      setSymptoms('');
      setNotes('');
      setPaymentMethod('qr');
      setUpiId('');
      setTransactionRef('');
      setCardNumber('');
      setCardName('');
      setCardExpiry('');
      setCardCvv('');

      // Lock shift filter strictly to doctor's assigned shift
      if (doctor.shift === 'Morning') {
        setShiftFilter('Morning');
      } else if (doctor.shift === 'Evening') {
        setShiftFilter('Evening');
      } else {
        setShiftFilter('All');
      }

      availabilityAPI
        .getUpcomingDays(doctor._id)
        .then((res) => {
          if (res.success && res.data.length > 0) {
            setUpcomingDays(res.data);
            setSelectedDate(res.data[0].date);
          }
        })
        .catch((err) => console.error(err));
    }
  }, [isOpen, doctor]);

  // Fetch slots whenever selectedDate changes
  useEffect(() => {
    if (doctor && selectedDate) {
      setLoadingSlots(true);
      setSelectedSlot('');
      setErrorMessage('');

      availabilityAPI
        .getDoctorAvailability(doctor._id, selectedDate)
        .then((res) => {
          if (res.success) {
            setAvailabilityData(res.data);
          }
        })
        .catch((err) => {
          setErrorMessage(err.message);
        })
        .finally(() => {
          setLoadingSlots(false);
        });
    }
  }, [doctor, selectedDate]);

  if (!isOpen || !doctor) return null;

  const doctorUser = doctor.userId || {};
  const hospital = doctor.hospitalId || {};
  const doctorDisplayName = doctorUser.name
    ? `Dr. ${doctorUser.name.replace(/^(dr\.?\s*)+/i, '')}`
    : 'this doctor';

  const handleBookSubmit = async (e) => {
    e.preventDefault();
    if (!isAuthenticated) {
      setErrorMessage('Please login as a patient to book an appointment.');
      return;
    }

    if (!selectedDate || !selectedSlot) {
      setErrorMessage('Please pick both an appointment date and an available time slot.');
      return;
    }

    // Strict Shift Validation before submit
    const isPM = selectedSlot.includes('PM');
    const isNoon = selectedSlot.startsWith('12:');
    const isEvening = isPM && !isNoon;

    if (doctor.shift === 'Morning' && isEvening) {
      setErrorMessage(`Strict Shift Restriction: ${doctorDisplayName} is only available for Morning shift consultations (09:00 AM - 01:00 PM). Please choose an available morning time slot.`);
      return;
    }

    if (doctor.shift === 'Evening' && !isEvening) {
      setErrorMessage(`Strict Shift Restriction: ${doctorDisplayName} is only available for Evening shift consultations (02:00 PM - 08:00 PM). Please choose an available evening time slot.`);
      return;
    }

    // Payment Validation
    if (paymentMethod === 'upi' && !upiId.includes('@')) {
      setErrorMessage('Please enter a valid UPI ID (e.g., name@okaxis or 9876543210@ybl).');
      return;
    }

    if (paymentMethod === 'card') {
      if (cardNumber.replace(/\s/g, '').length < 16 || !cardExpiry || cardCvv.length < 3) {
        setErrorMessage('Please enter valid 16-digit Card Number, Expiry Date, and CVV.');
        return;
      }
    }

    setBookingLoading(true);
    setErrorMessage('');

    const paymentInfoText =
      paymentMethod === 'qr'
        ? `Paid via QR Scan${transactionRef ? ` (Ref: ${transactionRef})` : ''}`
        : paymentMethod === 'upi'
        ? `Paid via UPI (${upiId})`
        : paymentMethod === 'card'
        ? `Paid via Card (**** ${cardNumber.slice(-4)})`
        : `Paid via NetBanking (${selectedBank})`;

    try {
      const res = await appointmentAPI.bookAppointment({
        doctorId: doctor._id,
        date: selectedDate,
        timeSlot: selectedSlot,
        symptoms,
        notes: notes ? `${notes} | ${paymentInfoText}` : paymentInfoText,
      });

      if (res.success) {
        setBookingSuccessData({
          ...res.data,
          paymentMethodLabel: paymentInfoText,
        });
        fetchNotifications();
        try {
          confetti({
            particleCount: 80,
            spread: 70,
            origin: { y: 0.6 },
          });
        } catch (_) {}

        if (onBookingSuccess) {
          onBookingSuccess(res.data);
        }
      }
    } catch (err) {
      setErrorMessage(err.message);
    } finally {
      setBookingLoading(false);
    }
  };

  // Strict Shift Slot Filtering:
  const allSlots = availabilityData?.slots || [];
  const filteredSlots = allSlots.filter((slot) => {
    const isPM = slot.time.includes('PM');
    const isNoon = slot.time.startsWith('12:');
    const isEvening = isPM && !isNoon;

    if (doctor.shift === 'Morning') return !isEvening;
    if (doctor.shift === 'Evening') return isEvening;

    if (shiftFilter === 'Morning') return !isEvening;
    if (shiftFilter === 'Evening') return isEvening;
    return true;
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '660px', padding: '0', overflow: 'hidden' }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '20px 24px',
            background: 'linear-gradient(135deg, var(--slate-900) 0%, #1e293b 100%)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontSize: '0.78rem', color: 'var(--primary-300)', fontWeight: 600, textTransform: 'uppercase' }}>
              Doctor Consultation Booking
            </div>
            <h3 style={{ color: '#ffffff', fontSize: '1.25rem', marginTop: '2px' }}>
              {doctorDisplayName}
            </h3>
            <div style={{ fontSize: '0.8rem', color: 'var(--slate-300)', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
              <span>{doctor.specialization}</span>
              <span>•</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <MapPin size={13} style={{ color: 'var(--primary-400)' }} />
                Pincode: {hospital.pincode || doctor.hospitalPincode}
              </span>
              <span>•</span>
              <span style={{
                fontSize: '0.72rem',
                padding: '2px 8px',
                borderRadius: '12px',
                background: doctor.shift === 'Morning' ? '#dbeafe' : doctor.shift === 'Evening' ? '#ffedd5' : '#f3e8ff',
                color: doctor.shift === 'Morning' ? '#1e40af' : doctor.shift === 'Evening' ? '#9a3412' : '#6b21a8',
                fontWeight: 700,
              }}>
                {doctor.shift === 'Morning' ? '🌅 Morning Shift (Strict)' : doctor.shift === 'Evening' ? '🌆 Evening Shift (Strict)' : '🔄 Dual Shift'}
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              borderRadius: '50%',
              width: '34px',
              height: '34px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              cursor: 'pointer',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '24px', maxHeight: '78vh', overflowY: 'auto' }}>
          
          {/* Error Banner */}
          {errorMessage && (
            <div
              style={{
                padding: '12px 16px',
                background: 'var(--danger-bg)',
                border: '1px solid #fecaca',
                borderRadius: 'var(--radius-md)',
                color: '#b91c1c',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '18px',
              }}
            >
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Success Screen after Booking */}
          {bookingSuccessData ? (
            <div style={{ textAlign: 'center', padding: '20px 10px' }}>
              <div
                style={{
                  width: '68px',
                  height: '68px',
                  borderRadius: '50%',
                  background: 'var(--success-bg)',
                  color: 'var(--success)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                }}
              >
                <CheckCircle2 size={40} />
              </div>

              <h2 style={{ fontSize: '1.4rem', color: 'var(--slate-900)' }}>
                Payment & Appointment Confirmed!
              </h2>

              <p style={{ color: 'var(--slate-600)', fontSize: '0.9rem', marginTop: '6px' }}>
                Your payment was received and your slot with {doctorDisplayName} is confirmed.
              </p>

              {/* Summary Card */}
              <div
                style={{
                  background: 'var(--slate-50)',
                  border: '1px solid var(--slate-200)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '16px',
                  margin: '20px 0',
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  fontSize: '0.88rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--slate-500)' }}>Appointment ID:</span>
                  <strong style={{ color: 'var(--primary-700)' }}>{bookingSuccessData.appointmentNumber}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--slate-500)' }}>Date & Slot:</span>
                  <strong>{bookingSuccessData.date} at {bookingSuccessData.timeSlot}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--slate-500)' }}>Hospital / Pincode:</span>
                  <strong>{hospital.name} ({hospital.pincode})</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--slate-500)' }}>Consultation Fee:</span>
                  <strong style={{ color: '#15803d' }}>₹{bookingSuccessData.fee} (Paid)</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--slate-500)' }}>Payment Mode:</span>
                  <strong>{bookingSuccessData.paymentMethodLabel}</strong>
                </div>
              </div>

              <button onClick={onClose} className="btn btn-primary" style={{ width: '100%' }}>
                Done / View Appointment
              </button>
            </div>
          ) : (
            <form onSubmit={handleBookSubmit}>

              {!isAuthenticated && (
                <div
                  style={{
                    padding: '12px 16px',
                    background: 'linear-gradient(135deg, #f0fdfa 0%, #eff6ff 100%)',
                    border: '1.5px solid var(--primary-200)',
                    borderRadius: 'var(--radius-md)',
                    marginBottom: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '10px',
                  }}
                >
                  <div style={{ fontSize: '0.84rem', color: 'var(--slate-700)' }}>
                    <strong>Note:</strong> Browsing slots is open. Sign in or register to record your booking into MongoDB.
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <Link to="/login" className="btn btn-secondary btn-sm" style={{ padding: '4px 10px', fontSize: '0.78rem' }}>
                      Sign In
                    </Link>
                    <Link to="/register" className="btn btn-primary btn-sm" style={{ padding: '4px 10px', fontSize: '0.78rem' }}>
                      Register
                    </Link>
                  </div>
                </div>
              )}
              
              {/* STEP 1: Select Date (Upcoming 7 Days Pills) */}
              <div style={{ marginBottom: '20px' }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Calendar size={15} style={{ color: 'var(--primary-600)' }} />
                  <span>1. Select Appointment Date</span>
                </label>

                <div
                  style={{
                    display: 'flex',
                    gap: '8px',
                    overflowX: 'auto',
                    paddingBottom: '6px',
                  }}
                >
                  {upcomingDays.map((day) => {
                    const isSelected = selectedDate === day.date;
                    const dateObj = new Date(day.date);
                    const formattedDay = day.dayName.slice(0, 3);
                    const formattedNum = dateObj.getDate();
                    const monthName = dateObj.toLocaleString('en-US', { month: 'short' });

                    return (
                      <button
                        key={day.date}
                        type="button"
                        onClick={() => setSelectedDate(day.date)}
                        disabled={!day.isAvailable}
                        style={{
                          flex: '0 0 auto',
                          minWidth: '70px',
                          padding: '10px 8px',
                          borderRadius: 'var(--radius-md)',
                          border: isSelected ? '2px solid var(--primary-600)' : '1.5px solid var(--slate-200)',
                          background: isSelected ? 'var(--primary-50)' : '#ffffff',
                          cursor: day.isAvailable ? 'pointer' : 'not-allowed',
                          opacity: day.isAvailable ? 1 : 0.45,
                          textAlign: 'center',
                          transition: 'var(--transition)',
                        }}
                      >
                        <div style={{ fontSize: '0.72rem', color: isSelected ? 'var(--primary-700)' : 'var(--slate-500)', fontWeight: 600 }}>
                          {formattedDay}
                        </div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: isSelected ? 'var(--primary-700)' : 'var(--slate-900)' }}>
                          {formattedNum}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--slate-400)' }}>
                          {monthName}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* STEP 2: Shift Filter & Time Slots */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                  <label className="form-label" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Clock size={15} style={{ color: 'var(--primary-600)' }} />
                    <span>2. Select Time Slot</span>
                  </label>

                  {doctor.shift === 'Morning' ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#eff6ff', border: '1px solid #bfdbfe', padding: '3px 10px', borderRadius: '6px' }}>
                      <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#1e40af' }}>
                        🌅 Strict Morning Shift (09:00 AM – 01:00 PM)
                      </span>
                    </div>
                  ) : doctor.shift === 'Evening' ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fff7ed', border: '1px solid #fed7aa', padding: '3px 10px', borderRadius: '6px' }}>
                      <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#c2410c' }}>
                        🌆 Strict Evening Shift (02:00 PM – 08:00 PM)
                      </span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: '4px', background: 'var(--slate-100)', padding: '2px', borderRadius: '6px' }}>
                      {['All', 'Morning', 'Evening'].map((shift) => (
                        <button
                          key={shift}
                          type="button"
                          onClick={() => setShiftFilter(shift)}
                          style={{
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            padding: '3px 8px',
                            borderRadius: '4px',
                            border: 'none',
                            background: shiftFilter === shift ? '#ffffff' : 'transparent',
                            color: shiftFilter === shift ? 'var(--slate-900)' : 'var(--slate-500)',
                            cursor: 'pointer',
                            boxShadow: shiftFilter === shift ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                          }}
                        >
                          {shift}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {loadingSlots ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: 'var(--slate-500)', fontSize: '0.85rem' }}>
                    Loading available slots...
                  </div>
                ) : filteredSlots.length === 0 ? (
                  <div
                    style={{
                      padding: '24px',
                      textAlign: 'center',
                      background: 'var(--slate-50)',
                      borderRadius: 'var(--radius-md)',
                      color: 'var(--slate-500)',
                      fontSize: '0.85rem',
                    }}
                  >
                    No available {doctor.shift === 'Morning' ? 'morning shift (09:00 AM – 01:00 PM)' : doctor.shift === 'Evening' ? 'evening shift (02:00 PM – 08:00 PM)' : ''} slots on this date. Doctor might be on break or fully booked.
                  </div>
                ) : (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(105px, 1fr))',
                      gap: '8px',
                      maxHeight: '160px',
                      overflowY: 'auto',
                      padding: '4px',
                    }}
                  >
                    {filteredSlots.map((slot) => {
                      const isSelected = selectedSlot === slot.time;
                      return (
                        <button
                          key={slot.time}
                          type="button"
                          disabled={slot.isBooked}
                          onClick={() => setSelectedSlot(slot.time)}
                          className={`slot-pill ${slot.isBooked ? 'slot-booked' : ''} ${
                            isSelected ? 'slot-selected' : ''
                          }`}
                        >
                          {slot.time}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* STEP 3: Symptoms & Notes */}
              <div style={{ marginBottom: '20px' }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FileText size={15} style={{ color: 'var(--primary-600)' }} />
                  <span>3. Symptoms & Health Concerns (Optional)</span>
                </label>
                <textarea
                  className="form-control"
                  rows={2}
                  placeholder="Describe symptoms, e.g. persistent cough, chest pain, fever..."
                  value={symptoms}
                  onChange={(e) => setSymptoms(e.target.value)}
                  style={{ resize: 'vertical' }}
                />
              </div>

              {/* STEP 4: Payment Methods (QR Code, UPI ID, Card, Net Banking) */}
              <div
                style={{
                  marginBottom: '20px',
                  padding: '16px',
                  background: '#f8fafc',
                  border: '1.5px solid #e2e8f0',
                  borderRadius: '12px',
                }}
              >
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                  <Wallet size={16} style={{ color: 'var(--primary-600)' }} />
                  <span>4. Choose Payment Method (Pay ₹{doctor.consultationFee})</span>
                </label>

                {/* Payment Tabs */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: '8px',
                    marginBottom: '16px',
                  }}
                >
                  {[
                    { id: 'qr', label: 'QR Scanner', icon: QrCode },
                    { id: 'upi', label: 'UPI ID', icon: Smartphone },
                    { id: 'card', label: 'Card', icon: CreditCard },
                    { id: 'netbanking', label: 'NetBanking', icon: Landmark },
                  ].map((method) => {
                    const Icon = method.icon;
                    const active = paymentMethod === method.id;
                    return (
                      <button
                        key={method.id}
                        type="button"
                        onClick={() => setPaymentMethod(method.id)}
                        style={{
                          padding: '10px 6px',
                          borderRadius: '8px',
                          border: active ? '2px solid var(--primary-600)' : '1px solid #cbd5e1',
                          background: active ? '#eff6ff' : '#ffffff',
                          color: active ? 'var(--primary-700)' : '#475569',
                          fontWeight: active ? 700 : 600,
                          fontSize: '0.78rem',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '4px',
                          cursor: 'pointer',
                        }}
                      >
                        <Icon size={18} />
                        <span>{method.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Option 1: QR Scanner */}
                {paymentMethod === 'qr' && (
                  <div style={{ textAlign: 'center', background: '#ffffff', padding: '16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
                      Scan QR with PhonePe, GPay, Paytm or BHIM
                    </div>
                    <img
                      src={qrCodeImg}
                      alt="Payment QR Code"
                      style={{
                        width: '185px',
                        height: '185px',
                        objectFit: 'contain',
                        borderRadius: '10px',
                        border: '2px solid #e2e8f0',
                        padding: '6px',
                        margin: '0 auto 10px',
                        display: 'block',
                      }}
                    />
                    <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: '10px' }}>
                      Amount to Pay: <strong style={{ color: '#0f172a' }}>₹{doctor.consultationFee}</strong>
                    </div>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Enter UTR / Transaction ID (Optional)"
                      value={transactionRef}
                      onChange={(e) => setTransactionRef(e.target.value)}
                      style={{ maxWidth: '280px', margin: '0 auto', fontSize: '0.82rem', padding: '7px 10px', textAlign: 'center' }}
                    />
                  </div>
                )}

                {/* Option 2: UPI ID */}
                {paymentMethod === 'upi' && (
                  <div style={{ background: '#ffffff', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '6px' }}>
                      Enter Your UPI ID
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g., dheeraj@ybl or mobile@paytm"
                      value={upiId}
                      onChange={(e) => setUpiId(e.target.value)}
                      style={{ fontSize: '0.88rem' }}
                    />
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '6px' }}>
                      Supported apps: Google Pay, PhonePe, Paytm, Amazon Pay, BHIM UPI
                    </div>
                  </div>
                )}

                {/* Option 3: Debit / Credit Card */}
                {paymentMethod === 'card' && (
                  <div style={{ background: '#ffffff', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div>
                      <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#334155' }}>Card Number</label>
                      <input
                        type="text"
                        maxLength={19}
                        className="form-control"
                        placeholder="1234 5678 9012 3456"
                        value={cardNumber}
                        onChange={(e) => setCardNumber(e.target.value)}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#334155' }}>Cardholder Name</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Name on Card"
                        value={cardName}
                        onChange={(e) => setCardName(e.target.value)}
                      />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#334155' }}>Expiry (MM/YY)</label>
                        <input
                          type="text"
                          maxLength={5}
                          className="form-control"
                          placeholder="08/29"
                          value={cardExpiry}
                          onChange={(e) => setCardExpiry(e.target.value)}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#334155' }}>CVV</label>
                        <input
                          type="password"
                          maxLength={3}
                          className="form-control"
                          placeholder="123"
                          value={cardCvv}
                          onChange={(e) => setCardCvv(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Option 4: Net Banking */}
                {paymentMethod === 'netbanking' && (
                  <div style={{ background: '#ffffff', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '6px' }}>
                      Select Your Bank
                    </label>
                    <select
                      className="form-control"
                      value={selectedBank}
                      onChange={(e) => setSelectedBank(e.target.value)}
                    >
                      <option value="SBI">State Bank of India (SBI)</option>
                      <option value="HDFC">HDFC Bank</option>
                      <option value="ICICI">ICICI Bank</option>
                      <option value="Axis">Axis Bank</option>
                      <option value="PNB">Punjab National Bank (PNB)</option>
                      <option value="Kotak">Kotak Mahindra Bank</option>
                    </select>
                  </div>
                )}
              </div>

              {/* STEP 5: Fee & Confirmation Button */}
              <div
                style={{
                  paddingTop: '16px',
                  borderTop: '1px solid var(--slate-200)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--slate-400)', textTransform: 'uppercase', fontWeight: 600 }}>
                    Total Payable
                  </div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--slate-900)' }}>
                    ₹{doctor.consultationFee}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={bookingLoading || !selectedSlot}
                  className="btn btn-primary"
                  style={{ minWidth: '210px' }}
                >
                  {bookingLoading ? 'Processing Payment...' : `Pay ₹${doctor.consultationFee} & Confirm`}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}