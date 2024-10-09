Overview of the Application

This application is a product recommendation system for an platform.
It includes features like logging user interactions (views, purchases, likes, comments),
recommending products to users based on their interactions (using collaborative filtering, content-based filtering, or a hybrid approach),
and providing a user profile.

Core Components:

1. Database Structure
2. Backend Routes
3. Recommendation System
4. User Interactions

---

1. Database Structure

Your database consists of several tables related to users, products, and user interactions. Here's an explanation of each table:

Users Table:
Stores information about users, including their login credentials and account creation date.

CREATE TABLE users (
user_id SERIAL PRIMARY KEY, -- Automatically increments
username VARCHAR(255) NOT NULL,
email VARCHAR(255) NOT NULL UNIQUE,
password VARCHAR(255) NOT NULL,
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

Products Table:
Stores information about the products available in the platform, including product name, category, tags, price, and brand.

CREATE TABLE products (
product_id SERIAL PRIMARY KEY, -- Automatically increments
product_name VARCHAR(255) NOT NULL,
category VARCHAR(255),
tags VARCHAR(255),
price DECIMAL(10, 2) NOT NULL,
brand VARCHAR(255),
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

User Interactions Table:
Tracks user interactions with products such as views, purchases, likes, and comments.
The interaction_type field stores the type of interaction, and a composite primary key (user_id, product_id, interaction_type) ensures each interaction is unique.

CREATE TABLE user_interactions (
user_id INT NOT NULL,
product_id INT NOT NULL,
interaction_type VARCHAR(50) NOT NULL, -- 'view', 'purchase', 'like', 'comment'
interaction_count INT DEFAULT 1,
comment_text TEXT,
date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
PRIMARY KEY (user_id, product_id, interaction_type),
FOREIGN KEY (user_id) REFERENCES users(user_id),
FOREIGN KEY (product_id) REFERENCES products(product_id)
);

Influencers Table:
Stores information about influencers who may promote products.

CREATE TABLE influencers (
influencer_id SERIAL PRIMARY KEY,
influencer_name VARCHAR(255) NOT NULL,
follower_count INT DEFAULT 0,
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

Influencer Posts Table:
Tracks posts made by influencers about products, including the number of likes and comments on the posts.

CREATE TABLE influencer_posts (
post_id SERIAL PRIMARY KEY,
product_id INT,
influencer_id INT,
post_text TEXT,
post_likes INT DEFAULT 0,
post_comments INT DEFAULT 0,
post_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
FOREIGN KEY (product_id) REFERENCES products(product_id)
);

Product Views and Purchases Tables:
Tracks how many times a user has viewed or purchased a product.

CREATE TABLE product_views (
product_id INT NOT NULL,
user_id INT NOT NULL,
view_count INT DEFAULT 1,
last_viewed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
PRIMARY KEY (product_id, user_id),
FOREIGN KEY (user_id) REFERENCES users(user_id),
FOREIGN KEY (product_id) REFERENCES products(product_id)
);

CREATE TABLE product_purchases (
product_id INT NOT NULL,
user_id INT NOT NULL,
purchase_count INT DEFAULT 1,
last_purchased TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
PRIMARY KEY (product_id, user_id),
FOREIGN KEY (user_id) REFERENCES users(user_id),
FOREIGN KEY (product_id) REFERENCES products(product_id)
);

---

2. Backend Routes

The backend routes handle user interactions, recommendations, and user profiles. Below is an overview of the routes and their purpose.

Route: /interactions (POST)
This route logs user interactions with products. It accepts the following body parameters:

- userId: ID of the user interacting with the product.
- productId: ID of the product being interacted with.
- interactionType: Type of interaction (e.g., view, purchase, like, comment).

It inserts a new entry into the user_interactions table.

app.post('/interactions', async (req, res) => {
const { userId, productId, interactionType } = req.body;
// Validate required fields
// Insert into `user_interactions` table
});

Route: /recommendations/:userId (GET)
This route fetches product recommendations for a user. It checks if the user is new (no previous interactions) and recommends top products for new users. For returning users, it uses a hybrid recommendation approach combining collaborative filtering and content-based filtering.

app.get('/recommendations/:userId', async (req, res) => {
const userId = req.params.userId;
const isNew = await isNewUser(userId); // Check if the user is new
let recommendations = [];

    if (isNew) {
        recommendations = await recommendForNewUser();  // For new users
    } else {
        recommendations = await hybridRecommendation(userId);  // For returning users
    }

    res.json({ success: true, recommendations });

});

Route: /profile/:userId (GET)
This route retrieves the profile of a user by their userId, including their username, email, and account creation date.

app.get('/profile/:userId', async (req, res) => {
const userId = req.params.userId;
try {
const profile = await createUserProfile(userId);
res.json({ success: true, profile });
} catch (error) {
res.status(500).json({ success: false, error: error.message });
}
});

Route: /test-recommendations/:userId (GET)
This route performs A/B testing between collaborative filtering and content-based filtering to provide recommendations using a random strategy (50% chance).

app.get('/test-recommendations/:userId', async (req, res) => {
const userId = req.params.userId;
const isCollaborative = Math.random() < 0.5; // Randomly choose strategy
const recommendations = isCollaborative
? await collaborativeFiltering(userId) // Collaborative filtering
: await contentBasedFiltering(userId); // Content-based filtering

    res.json({
        success: true,
        strategy: isCollaborative ? 'Collaborative' : 'Content-Based',
        recommendations
    });

});

---

3. Recommendation System

The recommendation system includes three strategies:

a. Collaborative Filtering
This method recommends products based on the behaviors of similar users. It analyzes which products a user has interacted with (viewed, purchased, liked) and finds other users who have interacted with the same products. Recommendations are based on what these similar users have interacted with.

b. Content-Based Filtering
This method recommends products based on the metadata (category, tags, etc.) of products that a user has interacted with. It finds other products with similar metadata and recommends them.

c. Hybrid Recommendation
This combines both collaborative and content-based filtering. It assigns weighted scores to recommendations from both methods and combines them to provide more accurate recommendations.

---

4. User Interactions

User interactions are logged to track user activity, which forms the basis for the recommendation system. The interaction types include:

- View: When a user views a product.
- Purchase: When a user purchases a product.
- Like: When a user likes a product.
- Comment: When a user comments on a product.

These interactions are stored in the user_interactions table and help build the recommendation logic.

---

Conclusion

This application combines database-driven interactions and machine learning techniques to create a dynamic product recommendation system. By logging user interactions and using hybrid recommendation methods, it provides personalized recommendations for each user, enhancing the eCommerce experience.
