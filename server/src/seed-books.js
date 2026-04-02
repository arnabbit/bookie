require('dotenv').config();
const mongoose = require('mongoose');
const Book = require('./models/Book');
const connectDB = require('./config/database');

const sampleBooks = [
  {
    title: 'The Art of War',
    author: 'Sun Tzu',
    description: 'Ancient Chinese military treatise',
    pages: [
      { pageNumber: 1, content: 'Sun Tzu said: The art of war is of vital importance to the State. It is a matter of life and death, a road either to safety or to ruin. Hence it is a subject of inquiry which can on no account be neglected.' },
      { pageNumber: 2, content: 'The art of war, then, is governed by five constant factors, to be taken into account in ones deliberations, when seeking to determine the conditions obtaining in the field. These are: (1) The Moral Law; (2) Heaven; (3) Earth; (4) The Commander; (5) Method and Discipline.' },
      { pageNumber: 3, content: 'The Moral Law causes the people to be in complete accord with their ruler, so that they will follow him regardless of their lives, undismayed by any danger.' },
    ],
  },
  {
    title: 'Meditations',
    author: 'Marcus Aurelius',
    description: 'Personal writings of the Roman Emperor on Stoic philosophy',
    pages: [
      { pageNumber: 1, content: 'Begin the morning by saying to thyself, I shall meet with the busy-body, the ungrateful, arrogant, deceitful, envious, unsocial. All these things happen to them by reason of their ignorance of what is good and evil.' },
      { pageNumber: 2, content: 'But I who have seen the nature of the good that it is beautiful, and of the bad that it is ugly, and the nature of him who does wrong, that it is akin to me, can neither be injured by any of them.' },
      { pageNumber: 3, content: 'You have power over your mind - not outside events. Realize this, and you will find strength. The happiness of your life depends upon the quality of your thoughts.' },
    ],
  },
  {
    title: 'The Prince',
    author: 'Niccolo Machiavelli',
    description: 'Political treatise on acquiring and maintaining power',
    pages: [
      { pageNumber: 1, content: 'All states, all powers, that have held and hold rule over men have been and are either republics or principalities. Principalities are either hereditary or new.' },
      { pageNumber: 2, content: 'It is better to be feared than loved, if you cannot be both. For men have less scruple in offending one who is beloved than one who is feared.' },
      { pageNumber: 3, content: 'A wise ruler ought never to keep faith when by doing so it would be against his interests. Men are so simple and yield so readily to the desires of the moment.' },
    ],
  },
];

(async () => {
  await connectDB();

  const existing = await Book.countDocuments();
  if (existing > 0) {
    console.log(`${existing} books already exist. Skipping seed.`);
    process.exit(0);
  }

  await Book.insertMany(sampleBooks);
  console.log(`Seeded ${sampleBooks.length} books.`);
  process.exit(0);
})();
