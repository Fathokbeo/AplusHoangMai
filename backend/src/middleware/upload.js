const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const UPLOADS_DIR = path.join(__dirname, '../../uploads');

function createStorage(subDir) {
  const dir = path.join(UPLOADS_DIR, subDir);
  fs.mkdirSync(dir, { recursive: true });
  return multer.diskStorage({
    destination: (req, file, cb) => cb(null, dir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${uuidv4()}${ext}`);
    },
  });
}

const uploadAd = multer({
  storage: createStorage('ads'),
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Chỉ chấp nhận file ảnh'));
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});

const uploadHomework = multer({
  storage: createStorage('homework'),
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Chỉ chấp nhận file PDF'));
  },
  limits: { fileSize: 50 * 1024 * 1024 },
});

const uploadSubmission = multer({
  storage: createStorage('submissions'),
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Chỉ chấp nhận file PDF hoặc ảnh'));
  },
  limits: { fileSize: 20 * 1024 * 1024 },
});

const uploadVideo = multer({
  storage: createStorage('videos'),
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) cb(null, true);
    else cb(new Error('Chỉ chấp nhận file video'));
  },
  limits: { fileSize: 500 * 1024 * 1024 },
});

// File đính kèm bài giảng: tài liệu bài giảng / đáp án bài tập trên lớp (PDF, ảnh, Office)
const LESSON_FILE_TYPES = [
  'application/pdf',
  'image/jpeg', 'image/png', 'image/jpg', 'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];
const uploadLessonFile = multer({
  storage: createStorage('lessons'),
  fileFilter: (req, file, cb) => {
    if (LESSON_FILE_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Chỉ chấp nhận file PDF, ảnh hoặc tài liệu Office'));
  },
  limits: { fileSize: 50 * 1024 * 1024 },
});

const uploadCourseThumbnail = multer({
  storage: createStorage('courses'),
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Chỉ chấp nhận file ảnh'));
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

// Upload ảnh chung cho nội dung trang (học sinh, giáo viên, khóa tiêu biểu, thành tích)
function makeImageUpload(subDir) {
  return multer({
    storage: createStorage(subDir),
    fileFilter: (req, file, cb) => {
      if (file.mimetype.startsWith('image/')) cb(null, true);
      else cb(new Error('Chỉ chấp nhận file ảnh'));
    },
    limits: { fileSize: 5 * 1024 * 1024 },
  });
}

const uploadContent = {
  'featured-students': makeImageUpload('featured_students'),
  'staff': makeImageUpload('staff'),
  'featured-courses': makeImageUpload('featured_courses'),
  'achievements': makeImageUpload('achievements'),
};

module.exports = { uploadAd, uploadHomework, uploadSubmission, uploadVideo, uploadCourseThumbnail, uploadContent, uploadLessonFile };
