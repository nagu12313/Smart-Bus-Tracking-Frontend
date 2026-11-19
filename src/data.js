export const initialBuses = [
  { id: 1, busNumber: "AP-07-AB-1234", number: "AP-07-AB-1234", busName: "Campus Express 01", name: "Campus Express 01", capacity: 50, status: "ON_ROUTE", routeId: 1, driverId: 1, driverName: "Ramesh Kumar", latitude: 16.3067, longitude: 80.4365, lat: 16.3067, lng: 80.4365, speed: 32 },
  { id: 2, busNumber: "AP-07-CD-5678", number: "AP-07-CD-5678", busName: "Campus Express 02", name: "Campus Express 02", capacity: 45, status: "AT_STOP", routeId: 2, driverId: 2, driverName: "Suresh Babu", latitude: 16.3170, longitude: 80.4510, lat: 16.3170, lng: 80.4510, speed: 0 },
  { id: 3, busNumber: "AP-07-EF-9012", number: "AP-07-EF-9012", busName: "Campus Express 03", name: "Campus Express 03", capacity: 40, status: "OFFLINE", routeId: 3, driverId: 3, driverName: "Mohan Rao", latitude: 16.2900, longitude: 80.4200, lat: 16.2900, lng: 80.4200, speed: 0 }
];
export const initialDrivers = [
  { id: 1, name: "Ramesh Kumar", phone: "9876543210", licenseNumber: "AP072020001", license: "AP072020001", busId: 1, status: "ACTIVE" },
  { id: 2, name: "Suresh Babu", phone: "9876543211", licenseNumber: "AP072020002", license: "AP072020002", busId: 2, status: "ACTIVE" },
  { id: 3, name: "Mohan Rao", phone: "9876543212", licenseNumber: "AP072020003", license: "AP072020003", busId: 3, status: "INACTIVE" }
];
export const initialStudents = [
  { id: 1, name: "Ananya Sharma", email: "ananya@student.campus.edu", rollNumber: "CSE2401", roll: "CSE2401", className: "B.Tech CSE", parentName: "Priya Sharma", parent: "Priya Sharma", parentPhone: "9876500011", phone: "9876500011", busId: 1, stop: "Lakshmipuram" },
  { id: 2, name: "Arjun Reddy", email: "arjun@edutrack.com", rollNumber: "ECE2402", roll: "ECE2402", className: "B.Tech ECE", parentName: "Ravi Reddy", parent: "Ravi Reddy", parentPhone: "9876500012", phone: "9876500012", busId: 1, stop: "Brodipet" },
  { id: 3, name: "Kavya Rao", email: "kavya@edutrack.com", rollNumber: "MBA2403", roll: "MBA2403", className: "MBA", parentName: "Sita Rao", parent: "Sita Rao", parentPhone: "9876500013", phone: "9876500013", busId: 2, stop: "Nallapadu" },
  { id: 4, name: "Rahul Verma", email: "rahul@edutrack.com", rollNumber: "CSE2404", roll: "CSE2404", className: "B.Tech CSE", parentName: "Amit Verma", parent: "Amit Verma", parentPhone: "9876500014", phone: "9876500014", busId: 2, stop: "Chandramouli Nagar" }
];
export const initialRoutes = [
  { id: 1, name: "Guntur Central Route", startPoint: "Lakshmipuram", start: "Lakshmipuram", endPoint: "Main Campus", end: "Main Campus", stops: "Lakshmipuram, Brodipet, Arundelpet, Main Campus", distance: "12 km" },
  { id: 2, name: "Tenali Route", startPoint: "Tenali Bus Stand", start: "Tenali Bus Stand", endPoint: "Main Campus", end: "Main Campus", stops: "Tenali Bus Stand, Nallapadu, Ring Road, Main Campus", distance: "24 km" },
  { id: 3, name: "Mangalagiri Route", startPoint: "Mangalagiri", start: "Mangalagiri", endPoint: "Main Campus", end: "Main Campus", stops: "Mangalagiri, Autonagar, Inner Ring Road, Main Campus", distance: "19 km" }
];