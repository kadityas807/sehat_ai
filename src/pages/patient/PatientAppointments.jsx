import React, { useState } from 'react';
import { sendEmailNotification } from '@/lib/emailService';
import { addDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, format, isAfter, startOfDay, isSameDay, addMonths, isSameMonth } from 'date-fns';
import { supabase } from '@/database/supabaseClient';
import { appointmentService } from '@/database/appointmentService';


const FACILITIES = [
    {
        id: 'lks',
        name: "Lok Kalyan Samiti (LKS) Hospital",
        image: "https://images.unsplash.com/photo-1586773860418-d37222d8fce3?w=600&q=80",
        rating: 4.8,
        distance: "0.5 miles away",
        location: "Vishnu Digamber Marg, ITO",
        tags: ["General Care", "Specialized Care"],
        price: 50
    },
    {
        id: 'gbpant',
        name: "G.B. Pant Hospital",
        image: "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=600&q=80",
        rating: 4.9,
        distance: "1.5 miles away",
        location: "Maulana Azad Medical College Campus",
        tags: ["Cardiology", "Neurology", "GI Care"],
        price: 70
    },
    {
        id: 'maulana_azad',
        name: "Maulana Azad Dental College",
        image: "https://images.unsplash.com/photo-1538108149393-cebb47acdd4e?w=600&q=80",
        rating: 4.6,
        distance: "1.2 miles away",
        location: "Bahadur Shah Zafar Marg",
        tags: ["Dental", "Oral Health"],
        price: 40
    },
    {
        id: 'shroffs',
        name: "Dr. Shroff's Charity Eye Hospital",
        image: "https://plus.unsplash.com/premium_photo-1661766718556-13c2efac1388?q=80&w=600&auto=format&fit=crop",
        rating: 4.8,
        distance: "1.8 miles away",
        location: "Babar Road, Bengali Market",
        tags: ["Ophthalmology", "ENT"],
        price: 60
    },
    {
        id: 'dhli',
        name: "Delhi Heart and Lungs Institute (DHLI)",
        image: "https://images.unsplash.com/photo-1512678080530-7760d81faba6?w=600&q=80",
        rating: 4.7,
        distance: "2.1 miles away",
        location: "Panchkuian Road, RK Ashram",
        tags: ["Cardiology", "Pulmonology"],
        price: 90
    }
];

import { useAuth } from '@/contexts/AuthContext';

export default function PatientAppointments({ onNavigate }) {
    const { user } = useAuth();
    const today = startOfDay(new Date());
    const [baseDate, setBaseDate] = useState(today);
    const [selectedDate, setSelectedDate] = useState(today);
    const [selectedSlot, setSelectedSlot] = useState('11:00 AM');
    const [selectedFacilityId, setSelectedFacilityId] = useState('lks');
    const [specialty, setSpecialty] = useState('');
    const [distance, setDistance] = useState('');
    const [rating, setRating] = useState('');

    const allTags = Array.from(new Set(FACILITIES.flatMap(f => f.tags)));

    const filteredFacilities = FACILITIES.filter(fac => {
        if (specialty && !fac.tags.includes(specialty)) return false;
        if (distance) {
            const facDist = parseFloat(fac.distance);
            if (facDist > parseFloat(distance)) return false;
        }
        if (rating && fac.rating < parseFloat(rating)) return false;
        return true;
    });

    const maxDate = addDays(today, 21); // exactly 3 weeks ahead

    const monthStart = startOfMonth(baseDate);
    const monthEnd = endOfMonth(baseDate);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 1 }); // Monday
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 }); // Sunday

    const calendarDates = [];
    let currentDay = startDate;
    while (currentDay <= endDate) {
        const isCurrentMonth = isSameMonth(currentDay, monthStart);
        const grey = !isCurrentMonth || currentDay < today || isAfter(currentDay, maxDate);
        calendarDates.push({
            d: format(currentDay, 'd'),
            dateObj: currentDay,
            grey: grey,
            isCurrentMonth: isCurrentMonth
        });
        currentDay = addDays(currentDay, 1);
    }

    const handlePrevMonth = () => setBaseDate(addMonths(baseDate, -1));
    const handleNextMonth = () => setBaseDate(addMonths(baseDate, 1));

    const getAvailableSlots = () => {
        const day = selectedDate.getDay();
        
        // Sunday
        if (day === 0) return selectedFacilityId === 'lks' ? ['10:00 AM', '11:30 AM'] : [];
        
        if (selectedFacilityId === 'lks' || selectedFacilityId === 'gbpant') { 
            return day % 2 === 0 
                ? ['09:00 AM', '10:30 AM', '11:00 AM', '01:30 PM', '03:00 PM', '04:30 PM']
                : ['08:30 AM', '09:45 AM', '11:15 AM', '02:00 PM', '05:00 PM'];
        } else if (selectedFacilityId === 'dhli' || selectedFacilityId === 'maulana_azad') {
            return day % 2 === 0
                ? ['08:00 AM', '09:15 AM', '12:00 PM', '03:45 PM', '06:00 PM']
                : ['07:30 AM', '10:00 AM', '01:00 PM', '04:30 PM'];
        } else {
            return day === 6 // Saturday
                ? ['09:00 AM', '10:00 AM', '11:00 AM']
                : ['10:00 AM', '11:30 AM', '02:00 PM', '04:15 PM', '05:30 PM'];
        }
    };

    const slots = getAvailableSlots();

    return (
        <div className="flex-1 space-y-6 pt-0 font-display bg-background-light dark:bg-background-dark min-h-full">
            {/* Filters Row */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 py-4 sticky top-0 bg-background-light dark:bg-background-dark/95 backdrop-blur z-20">
                <div className="flex flex-wrap items-center gap-3">
                    <button 
                        onClick={() => { setSpecialty(''); setDistance(''); setRating(''); }}
                        className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-4 py-2.5 rounded-lg text-sm font-bold shadow-sm shadow-primary/20 transition-all">
                        <span className="material-symbols-outlined text-[18px]">tune</span>
                        Clear Filters
                    </button>
                    
                    <FilterDropdown label="Specialty" value={specialty} onChange={(e) => setSpecialty(e.target.value)} options={allTags} />
                    <FilterDropdown label="Distance" value={distance} onChange={(e) => setDistance(e.target.value)} options={['1', '3', '5', '10']} suffix=" miles" />
                    <FilterDropdown label="Rating" value={rating} onChange={(e) => setRating(e.target.value)} options={['4.0', '4.5', '4.8']} suffix="+" />
                </div>
                <div className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                    Showing {filteredFacilities.length} Available Facilities
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pb-12 pt-2">
                {/* Left Column - Fixed Width 4 cols */}
                <div className="lg:col-span-4 space-y-6">
                    {/* Select Date Card */}
                    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="font-bold text-lg text-slate-900 dark:text-white">Select Date <span className="text-sm font-medium text-slate-500 ml-2">{format(baseDate, 'MMMM yyyy')}</span></h3>
                            <div className="flex gap-2 text-slate-400 dark:text-slate-500">
                                <button 
                                    onClick={handlePrevMonth} 
                                    disabled={startOfMonth(baseDate) <= startOfMonth(today)}
                                    className="size-8 flex items-center justify-center border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <span className="material-symbols-outlined text-[20px]">chevron_left</span>
                                </button>
                                <button 
                                    onClick={handleNextMonth} 
                                    disabled={startOfMonth(baseDate) >= startOfMonth(maxDate)}
                                    className="size-8 flex items-center justify-center border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <span className="material-symbols-outlined text-[20px]">chevron_right</span>
                                </button>
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-7 gap-y-6 gap-x-1 text-center">
                            {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map(day => (
                                <div key={day} className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">{day}</div>
                            ))}
                            
                            {calendarDates.map((item, i) => {
                                const isSelected = isSameDay(item.dateObj, selectedDate) && !item.grey && item.isCurrentMonth;
                                return (
                                    <button 
                                        key={i} 
                                        onClick={() => !item.grey && item.isCurrentMonth && setSelectedDate(item.dateObj)}
                                        className={`font-semibold text-sm size-8 mx-auto flex items-center justify-center rounded-full transition-all ${
                                            !item.isCurrentMonth 
                                                ? 'opacity-0 cursor-default pointer-events-none' 
                                                : isSelected 
                                                    ? 'bg-primary text-white shadow-md shadow-primary/30' 
                                                    : item.grey 
                                                        ? 'text-slate-300 dark:text-slate-700 cursor-not-allowed' 
                                                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer'
                                        }`}
                                    >
                                        {item.d}
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    {/* Available Slots Card */}
                    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                        <h3 className="font-bold text-lg text-slate-900 dark:text-white mb-6 flex flex-col">
                            Available Slots
                            <span className="text-xs font-medium text-primary mt-1 w-full truncate">{FACILITIES.find(f => f.id === selectedFacilityId)?.name || ''}</span>
                        </h3>
                        <div className="grid grid-cols-2 gap-3">
                            {slots.length > 0 ? slots.map((slot, i) => {
                                const isSelected = slot === selectedSlot;
                                return (
                                    <button 
                                        key={i}
                                        onClick={() => setSelectedSlot(slot)}
                                        className={`py-2.5 px-4 rounded-xl text-sm font-bold transition-colors ${
                                            isSelected 
                                                ? 'bg-primary/5 text-primary border-2 border-primary/40 shadow-sm shadow-primary/10' 
                                                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                                        }`}
                                    >
                                        {slot}
                                    </button>
                                )
                            }) : (
                                <div className="col-span-2 text-center py-8 text-sm text-slate-500 font-medium">No slots available for this location on the selected date.</div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Column - 8 cols */}
                <div className="lg:col-span-8 flex flex-col gap-6">
                    {/* Hero Map Banner */}
                    <div className="relative h-44 rounded-2xl overflow-hidden shadow-sm bg-linear-to-br from-slate-400 to-slate-500 dark:from-slate-700 dark:to-slate-800 flex items-end p-6">
                        {/* Fake huge pin graphic in background */}
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[40%] text-white/20 dark:text-white/5 pointer-events-none">
                            <span className="material-symbols-outlined" style={{ fontSize: '280px', fontVariationSettings: '"FILL" 1' }}>location_on</span>
                        </div>
                        {/* Bottom text */}
                        <div className="relative z-10 flex items-center gap-2 text-white font-medium">
                            <span className="material-symbols-outlined text-primary text-xl" style={{ fontVariationSettings: '"FILL" 1' }}>location_on</span>
                            <span className="text-sm sm:text-base lg:text-lg tracking-wide shadow-sm">Finding the best medical help near you in Marylebone, London</span>
                        </div>
                    </div>

                    <h2 className="text-xl font-extrabold text-slate-900 dark:text-white mt-2">Top Recommended Facilities</h2>

                    {/* Facility List */}
                    <div className="flex flex-col gap-5">
                        {filteredFacilities.map(fac => {
                            const isFacSelected = fac.id === selectedFacilityId;
                            return (
                                <div 
                                    key={fac.id} 
                                    onClick={() => setSelectedFacilityId(fac.id)}
                                    className={`bg-white dark:bg-slate-900 p-3 rounded-2xl border ${isFacSelected ? 'border-primary ring-2 ring-primary/20 bg-primary/5 dark:bg-primary/5' : 'border-slate-200 dark:border-slate-800'} shadow-sm flex flex-col sm:flex-row gap-5 hover:shadow-md transition-all cursor-pointer`}
                                >
                                    <img src={fac.image} alt={fac.name} className="w-full sm:w-[260px] h-48 sm:h-[180px] object-cover rounded-xl bg-slate-100 dark:bg-slate-800 shrink-0" />
                                
                                <div className="flex-1 flex flex-col justify-between py-2 pr-3">
                                    {/* Top Row */}
                                    <div>
                                        <div className="flex justify-between items-start gap-4">
                                            <h3 className="font-bold text-lg text-slate-900 dark:text-white leading-tight">{fac.name}</h3>
                                            <div className="flex items-center gap-1 bg-primary/10 text-primary px-2.5 py-1 rounded-md text-[11px] font-bold shrink-0">
                                                <span className="material-symbols-outlined text-[13px]" style={{ fontVariationSettings: '"FILL" 1' }}>star</span>
                                                {fac.rating}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1.5 mt-2 text-sm text-slate-500 dark:text-slate-400 font-medium">
                                            <span className="material-symbols-outlined text-[16px]">location_on</span>
                                            {fac.distance} <span className="text-slate-300 dark:text-slate-600 mx-0.5">•</span> {fac.location}
                                        </div>
                                        
                                        {/* Tags */}
                                        <div className="flex flex-wrap gap-2 mt-4">
                                            {fac.tags.map((tag, i) => (
                                                <span key={i} className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-3 py-1.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide">
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                    
                                    {/* Bottom Row */}
                                    <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
                                        <div className="text-sm font-medium text-slate-500 dark:text-slate-400">
                                            Consultation from <span className="font-extrabold text-slate-900 dark:text-white ml-0.5">${fac.price}</span>
                                        </div>
                                        <button 
                                            onClick={async (e) => { 
                                              e.stopPropagation(); 
                                              const newApt = {
                                                facility: fac,
                                                date: selectedDate,
                                                slot: selectedSlot
                                              };
                                              const existing = JSON.parse(localStorage.getItem('sehat_appointments') || '[]');
                                              localStorage.setItem('sehat_appointments', JSON.stringify([...existing, newApt]));
                                              
                                              try {
                                                let patientId = null;
                                                let emailToUse = "patient@example.com";
                                                
                                                if (user?.demo_mode) {
                                                  // Get a demo patient to assign this appointment to
                                                  const { data: pts } = await supabase.from('patients').select('id, full_name').limit(1);
                                                  patientId = pts?.[0]?.id;
                                                } else {
                                                  patientId = user?.id;
                                                  emailToUse = user?.email || emailToUse;
                                                }
                                                
                                                if (patientId) {
                                                  // Convert "11:00 AM" or "02:30 PM" to 24h format for the Date object
                                                  const timeMatch = selectedSlot.match(/(\d+):(\d+)\s+(AM|PM)/);
                                                  let hours = 9;
                                                  let minutes = 0;
                                                  if (timeMatch) {
                                                    hours = parseInt(timeMatch[1]);
                                                    minutes = parseInt(timeMatch[2]);
                                                    const isPM = timeMatch[3] === 'PM';
                                                    if (isPM && hours < 12) hours += 12;
                                                    if (!isPM && hours === 12) hours = 0;
                                                  }
                                                  
                                                  const aptDate = new Date(selectedDate);
                                                  aptDate.setHours(hours, minutes, 0, 0);

                                                  // Create Appointment mapped to the demo hospital
                                                  await appointmentService.createAppointment({
                                                    hospital_id: '11111111-1111-1111-1111-111111111111', 
                                                    patient_id: patientId,
                                                    appointment_time: aptDate.toISOString(),
                                                    status: 'pending',
                                                    reason: 'Consultation at ' + fac.name
                                                  });
                                                }
                                              } catch (err) {
                                                console.error("Failed to sync appointment to Doctor Dashboard:", err);
                                              }
                                              
                                              // Send Email
                                              sendEmailNotification({
                                                  type: "appointment",
                                                  email: emailToUse,
                                                  facility: fac.name,
                                                  date: selectedDate,
                                                  time: selectedSlot
                                              });

                                              onNavigate?.('confirmation'); 
                                            }}
                                            className="bg-primary hover:bg-primary/90 text-white font-bold text-sm px-6 py-2.5 rounded-lg shadow-sm shadow-primary/20 transition-colors cursor-pointer"
                                        >
                                            Book Now
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )})}
                    </div>
                </div>
            </div>
        </div>
    );
}

function FilterDropdown({ label, value, onChange, options, suffix = '' }) {
    return (
        <div className="relative group">
            <select
                value={value}
                onChange={onChange}
                className="appearance-none flex items-center justify-between gap-3 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 pl-4 pr-10 py-2.5 rounded-lg text-sm font-semibold transition-colors min-w-[120px] focus:ring-2 focus:ring-primary/20 focus:outline-none cursor-pointer"
            >
                <option value="">{label}</option>
                {options.map((opt, i) => (
                    <option key={i} value={opt}>
                        {opt}{suffix}
                    </option>
                ))}
            </select>
            <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-[18px] text-slate-400 pointer-events-none group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors">expand_more</span>
        </div>
    );
}
