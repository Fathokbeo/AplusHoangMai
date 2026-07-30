import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ToastContainer from './components/Toast';
import Layout from './components/Layout';

import Login from './pages/Login';
import Home from './pages/Home';
import FeaturedStudents from './pages/public/FeaturedStudents';
import OurTeachers from './pages/public/OurTeachers';
import FeaturedCourses from './pages/public/FeaturedCourses';
import Achievements from './pages/public/Achievements';

import AdminDashboard from './pages/admin/AdminDashboard';
import UserManagement from './pages/admin/UserManagement';
import AdManagement from './pages/admin/AdManagement';
import CourseManagement from './pages/admin/CourseManagement';
import AdminCourseDetail from './pages/admin/AdminCourseDetail';
import ClassManagement from './pages/admin/ClassManagement';
import SiteContent from './pages/admin/SiteContent';

import TeacherDashboard from './pages/teacher/TeacherDashboard';
import TeacherCourseDetail from './pages/teacher/TeacherCourseDetail';
import ClassDetail from './pages/teacher/ClassDetail';
import HomeworkDetail from './pages/teacher/HomeworkDetail';
import StudentManagement from './pages/teacher/StudentManagement';

import StudentDashboard from './pages/student/StudentDashboard';
import StudentClasses from './pages/student/StudentClasses';
import StudentCourseDetail from './pages/student/StudentCourseDetail';
import StudentClassDetail from './pages/student/StudentClassDetail';

function ProtectedRoute({ children, role }: { children: React.ReactElement; role?: string | string[] }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', flexDirection: 'column', gap: 12 }}>
      <div style={{ width: 36, height: 36, border: '3px solid #F0F0F0', borderTopColor: '#C62828', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      Đang tải...
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  if (role) {
    const roles = Array.isArray(role) ? role : [role];
    if (!roles.includes(user.role)) return <Navigate to={`/${user.role}`} replace />;
  }
  return children;
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/hoc-sinh" element={<FeaturedStudents />} />
      <Route path="/giao-vien" element={<OurTeachers />} />
      <Route path="/khoa-hoc" element={<FeaturedCourses />} />
      <Route path="/kinh-nghiem" element={<Achievements />} />
      <Route path="/login" element={user ? <Navigate to={`/${user.role}`} replace /> : <Login />} />

      {/* Admin */}
      <Route path="/admin" element={<ProtectedRoute role="admin"><Layout /></ProtectedRoute>}>
        <Route index element={<AdminDashboard />} />
        <Route path="users" element={<UserManagement />} />
        <Route path="courses" element={<CourseManagement />} />
        <Route path="courses/:courseId" element={<AdminCourseDetail />} />
        <Route path="classes" element={<ClassManagement />} />
        <Route path="content" element={<SiteContent />} />
        <Route path="ads" element={<AdManagement />} />
      </Route>

      {/* Teacher (admin cũng vào được) */}
      <Route path="/teacher" element={<ProtectedRoute role={['teacher', 'admin']}><Layout /></ProtectedRoute>}>
        <Route index element={<TeacherDashboard />} />
        <Route path="courses/:courseId" element={<TeacherCourseDetail />} />
        <Route path="classes/:id" element={<ClassDetail />} />
        <Route path="homework/:id" element={<HomeworkDetail />} />
        <Route path="students" element={<StudentManagement />} />
      </Route>

      {/* Student */}
      <Route path="/student" element={<ProtectedRoute role="student"><Layout /></ProtectedRoute>}>
        <Route index element={<StudentDashboard />} />
        <Route path="courses/:courseId" element={<StudentCourseDetail />} />
        <Route path="classes" element={<StudentClasses />} />
        <Route path="classes/:id" element={<StudentClassDetail />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastContainer />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
