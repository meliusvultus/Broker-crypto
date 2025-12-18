
import passport, { localstrategy} from 'passport';
import bcrypt from 'bcrypt';
import User from '../models/User.js'


passport.use(new localstrategy(async (username, password, cb) => {
    const user = User.findByEmail(email)
    if (!user) return cb(null, false, {message: "user not found"});
    
    const validatePassword = bcrypt.compare(password, user.password);
    if (!validatePassword) return cb(null, false, { message: "enter a valid password"});

    if (user && validatePassword) return cb(null, user)
}));

passport.serializeUser((user, cb) => {
    cb(null, user.id)
})

passport.deserializeUser((id, cb) => {
    const user = User.findById(id);
    cb(null, user);
})
