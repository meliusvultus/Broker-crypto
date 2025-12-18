const users = [];

User = {
    findByEmail: (email) => users.find(u => u.email === email),
    findById: (id) => users.find(u => u.id === id),
    create: (user) => users.push(user)};

    export default User;