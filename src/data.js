export const initialBuses = [
  { id: 1, number: "AP-07-AB-1234", name: "Campus Express 01", capacity: 50, status: "On Route", routeId: 1, driverId: 1, lat: 16.3067, lng: 80.4365, speed: 32 },
  { id: 2, number: "AP-07-CD-5678", name: "Campus Express 02", capacity: 45, status: "At Stop", routeId: 2, driverId: 2, lat: 16.3170, lng: 80.4510, speed: 0 },
  { id: 3, number: "AP-07-EF-9012", name: "Campus Express 03", capacity: 40, status: "Offline", routeId: 3, driverId: 3, lat: 16.2900, lng: 80.4200, speed: 0 }
];
export const initialDrivers = [
  { id: 1, name: "Ramesh Kumar", phone: "9876543210", license: "AP072020001", busId: 1, status: "Active" },
  { id: 2, name: "Suresh Babu", phone: "9876543211", license: "AP072020002", busId: 2, status: "Active" },
  { id: 3, name: "Mohan Rao", phone: "9876543212", license: "AP072020003", busId: 3, status: "Inactive" }
];
export const initialStudents = [
  { id: 1, name: "Ananya Sharma", roll: "CSE2401", className: "B.Tech CSE", parent: "Priya Sharma", phone: "9876500011", busId: 1, stop: "Lakshmipuram" },
  { id: 2, name: "Arjun Reddy", roll: "ECE2402", className: "B.Tech ECE", parent: "Ravi Reddy", phone: "9876500012", busId: 1, stop: "Brodಿಪet" },
  { id: 3, name: "Kavya Rao", roll: "MBA2403", className: "MBA", parent: "Sita Rao", phone: "9876500013", busId: 2, stop: "Nallapadu" },
  { id: 4, name: "Rahul Verma", roll: "CSE2404", className: "B.Tech CSE", parent: "Amit Verma", phone: "9876500014", busId: 2, stop: "Chandramouli Nagar" }
];
export const initialRoutes = [
  { id: 1, name: "Guntur Central Route", start: "Lakshmipuram", end: "Main Campus", stops: "Lakshmipuram, Brodipet, Arundelpet, Main Campus", distance: "12 km" },
  { id: 2, name: "Tenali Route", start: "Tenali Bus Stand", end: "Main Campus", stops: "Tenali Bus Stand, Nallapadu, Ring Road, Main Campus", distance: "24 km" },
  { id: 3, name: "Mangalagiri Route", start: "Mangalagiri", end: "Main Campus", stops: "Mangalagiri, Autonagar, Inner Ring Road, Main Campus", distance: "19 km" }
];
export const demoUsers = [
  { email: "admin@edutrack.com", password: "admin123", role: "Admin", name: "Administrator" },
  { email: "driver@edutrack.com", password: "driver123", role: "Driver", name: "Ramesh Kumar" },
  { email: "parent@edutrack.com", password: "parent123", role: "Parent", name: "Priya Sharma" },
  { email: "student@edutrack.com", password: "student123", role: "Student", name: "Ananya Sharma" }
];