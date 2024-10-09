const express = require('express');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const _ = require('lodash');

const app = express();
app.use(bodyParser.json());

// PostgreSQL connection setup
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'dataset',
    password: 'tECH@901',
    port: 5432
});

// Function to check if the user is new (no previous interactions)
async function isNewUser(userId) {
    const userInteractions = await pool.query('SELECT COUNT(*) FROM user_interactions WHERE user_id = $1', [userId]);
    return userInteractions.rows[0].count === '0'; // No interactions means new user
}

// For New Users: Recommend Top Viewed/Purchased Products
async function recommendForNewUser() {
    const topProducts = await pool.query(`
        SELECT product_id, 
            SUM(CASE WHEN interaction_type = 'purchase' THEN 5 ELSE 1 END) as score
        FROM user_interactions
        GROUP BY product_id
        ORDER BY score DESC
        LIMIT 10
    `);

    const productDetails = await pool.query(`
        SELECT product_id, product_name, category, tags, price, brand
        FROM products
        WHERE product_id = ANY($1::int[])
    `, [topProducts.rows.map(row => row.product_id)]);

    return productDetails.rows;
}


// Function to create a user profile
async function createUserProfile(userId) {
    try {
        // Query to retrieve user profile details
        const userProfile = await pool.query(`
            SELECT user_id, username, email, created_at 
            FROM users 
            WHERE user_id = $1
        `, [userId]);

        if (userProfile.rows.length === 0) {
            throw new Error('User not found');
        }

        // Return the profile details
        return userProfile.rows[0];
    } catch (error) {
        throw new Error(error.message);
    }
}



// Collaborative Filtering: Using Purchases, Views, Influencer Likes, and Comments
async function collaborativeFiltering(userId) {
    const userInteractions = await pool.query('SELECT product_id FROM user_interactions WHERE user_id = $1', [userId]);
    const productIds = userInteractions.rows.map(row => row.product_id);

    const similarUsers = await pool.query(`
        SELECT DISTINCT user_id 
        FROM user_interactions
        WHERE product_id = ANY($1::int[]) AND user_id != $2
    `, [productIds, userId]);

    const recommendations = await pool.query(`
        SELECT product_id, 
            SUM(CASE WHEN interaction_type = 'purchase' THEN 5 ELSE 1 END) as score
        FROM user_interactions
        WHERE user_id = ANY($1::int[]) AND product_id != ALL($2::int[])
        GROUP BY product_id
        ORDER BY score DESC
        LIMIT 10
    `, [similarUsers.rows.map(row => row.user_id), productIds]);

    const productDetails = await pool.query(`
        SELECT product_id, product_name, category, tags, price, brand 
        FROM products
        WHERE product_id = ANY($1::int[])
    `, [recommendations.rows.map(row => row.product_id)]);

    return productDetails.rows;
}

// Content-Based Filtering: Using Product Metadata (Category, Tags, etc.)
async function contentBasedFiltering(userId) {
    const userInteractions = await pool.query('SELECT product_id FROM user_interactions WHERE user_id = $1', [userId]);
    const productIds = userInteractions.rows.map(row => row.product_id);

    const productData = await pool.query('SELECT category, tags FROM products WHERE product_id = ANY($1::int[])', [productIds]);

    const similarProducts = await pool.query(`
        SELECT product_id 
        FROM products
        WHERE category = ANY($1::varchar[]) AND product_id != ALL($2::int[])
        ORDER BY similarity(tags, $3) DESC
        LIMIT 10
    `, [productData.rows.map(p => p.category), productIds, productData.rows.map(p => p.tags)]);

    const productDetails = await pool.query(`
        SELECT product_id, product_name, category, tags, price, brand 
        FROM products
        WHERE product_id = ANY($1::int[])
    `, [similarProducts.rows.map(row => row.product_id)]);

    return productDetails.rows;
}

// Hybrid Recommendation: Combine Collaborative and Content-Based Filtering with Weighted Score
async function hybridRecommendation(userId) {
    const collaborative = await collaborativeFiltering(userId);
    const contentBased = await contentBasedFiltering(userId);

    // Create weighted scores for both collaborative and content-based recommendations
    const collaborativeWeighted = collaborative.map(item => ({ ...item, score: item.score * 0.6 }));
    const contentWeighted = contentBased.map(item => ({ ...item, score: item.score * 0.4 }));

    // Combine results and sum scores for overlapping products
    const combinedResults = _.unionBy(collaborativeWeighted, contentWeighted, 'product_id');

    // Sort by final score and return top 10 recommendations
    return _.orderBy(combinedResults, ['score'], ['desc']).slice(0, 10);
}

// Log user interaction: Purchases, Views, Likes, Comments
app.post('/interactions', async (req, res) => {
    const { userId, productId, interactionType } = req.body;

    // Validate that all required fields are provided
    if (!userId || !productId || !interactionType) {
        return res.status(400).json({
            success: false,
            error: 'Missing required fields (userId, productId, interactionType)'
        });
    }

    try {
        // Check if the user exists
        const userExists = await pool.query('SELECT 1 FROM users WHERE user_id = $1', [userId]);

        if (userExists.rowCount === 0) {
            return res.status(400).json({
                success: false,
                error: 'User not found'
            });
        }

        // Insert the interaction into the database
        await pool.query(`
            INSERT INTO user_interactions (user_id, product_id, interaction_type)
            VALUES ($1, $2, $3)
        `, [userId, productId, interactionType]);

        // Send a success response back
        res.json({ success: true, message: 'Interaction logged successfully' });
    } catch (error) {
        // Handle any errors during the insert operation
        console.error('Error inserting interaction:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});




// API Route for Recommendations
app.get('/recommendations/:userId', async (req, res) => {
    const userId = req.params.userId;

    try {
        const isNew = await isNewUser(userId);
        let recommendations = [];

        if (isNew) {
            recommendations = await recommendForNewUser();
        } else {
            recommendations = await hybridRecommendation(userId);
        }

        res.json({ success: true, recommendations });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// User Profile Route: Retrieve user profile
app.get('/profile/:userId', async (req, res) => {
    const userId = req.params.userId;

    try {
        const profile = await createUserProfile(userId);
        res.json({ success: true, profile });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// A/B Testing for different recommendation strategies
app.get('/test-recommendations/:userId', async (req, res) => {
    const userId = req.params.userId;

    const isCollaborative = Math.random() < 0.5;
    const recommendations = isCollaborative
        ? await collaborativeFiltering(userId)
        : await contentBasedFiltering(userId);

    res.json({
        success: true,
        strategy: isCollaborative ? 'Collaborative' : 'Content-Based',
        recommendations
    });
});

// Start the server
const port = 3000;
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});






























// const express = require('express');
// const bodyParser = require('body-parser');
// const { Pool } = require('pg');
// const axios = require('axios');
// const _ = require('lodash');

// const app = express();
// app.use(bodyParser.json());

// // PostgreSQL connection setup
// const pool = new Pool({
//     user: 'postgres',
//     host: 'localhost',
//     database: 'analyze',
//     password: 'tECH@901',
//     port: 5432
// });

// // Function to check if the user is new (no previous interactions)
// async function isNewUser(userId) {
//     const userInteractions = await pool.query('SELECT COUNT(*) FROM user_interactions WHERE user_id = $1', [userId]);
//     return userInteractions.rows[0].count === '0'; // No interactions means new user
// }

// // For New Users: Recommend Top Liked Products
// async function recommendForNewUser() {
//     // Get the most popular products based on ratings or interactions
//     const topProducts = await pool.query(`
//         SELECT product_id, COUNT(*) as score
//         FROM user_interactions
//         GROUP BY product_id
//         ORDER BY score DESC
//         LIMIT 10
//     `);

//     // Fetch the details of the top products
//     const productDetails = await pool.query(`
//         SELECT product_id, product_name, category, tags, price, brand
//         FROM products
//         WHERE product_id = ANY($1::int[])
//     `, [topProducts.rows.map(row => row.product_id)]);

//     return productDetails.rows;
// }

// // Advanced Collaborative Filtering: Using Matrix Factorization or ALS (can be expanded later)
// async function collaborativeFiltering(userId) {
//     // Get products the user has interacted with
//     const userInteractions = await pool.query('SELECT product_id FROM user_interactions WHERE user_id = $1', [userId]);
//     const productIds = userInteractions.rows.map(row => row.product_id);

//     // Find similar users who interacted with the same products
//     const similarUsers = await pool.query(`
//         SELECT DISTINCT user_id
//         FROM user_interactions
//         WHERE product_id = ANY($1::int[]) AND user_id != $2
//     `, [productIds, userId]);

//     // Get recommendations from these users' interactions
//     const recommendations = await pool.query(`
//         SELECT product_id, COUNT(*) as score
//         FROM user_interactions
//         WHERE user_id = ANY($1::int[]) AND product_id != ALL($2::int[])
//         GROUP BY product_id
//         ORDER BY score DESC
//         LIMIT 10
//     `, [similarUsers.rows.map(row => row.user_id), productIds]);

//     // Fetch detailed product information
//     const productDetails = await pool.query(`
//         SELECT product_id, product_name, category, tags, price, brand
//         FROM products
//         WHERE product_id = ANY($1::int[])
//     `, [recommendations.rows.map(row => row.product_id)]);

//     return productDetails.rows;
// }

// // Content-Based Filtering: Using Product Metadata (Category, Tags, etc.)
// async function contentBasedFiltering(userId) {
//     // Get products the user interacted with
//     const userInteractions = await pool.query('SELECT product_id FROM user_interactions WHERE user_id = $1', [userId]);
//     const productIds = userInteractions.rows.map(row => row.product_id);

//     // Get metadata of products the user interacted with
//     const productData = await pool.query('SELECT category, tags FROM products WHERE product_id = ANY($1::int[])', [productIds]);

//     // Find other products similar based on category and tags
//     const similarProducts = await pool.query(`
//         SELECT product_id
//         FROM products
//         WHERE category = ANY($1::varchar[]) AND product_id != ALL($2::int[])
//         ORDER BY similarity(tags, $3) DESC
//         LIMIT 10
//     `, [productData.rows.map(p => p.category), productIds, productData.rows.map(p => p.tags)]);

//     // Fetch detailed product information
//     const productDetails = await pool.query(`
//         SELECT product_id, product_name, category, tags, price, brand
//         FROM products
//         WHERE product_id = ANY($1::int[])
//     `, [similarProducts.rows.map(row => row.product_id)]);

//     return productDetails.rows;
// }

// // Hybrid Recommendation: Combine Collaborative and Content-Based Filtering
// async function hybridRecommendation(userId) {
//     const collaborative = await collaborativeFiltering(userId);
//     const contentBased = await contentBasedFiltering(userId);

//     // Merge the results, removing duplicates
//     const combinedResults = [...new Set([...collaborative, ...contentBased])];



//     return combinedResults.slice(0, 10); // Return top 10 recommendations
// }

// // Real-time Recommendation Updates: Integrating real-time user interactions
// app.post('/interactions', async (req, res) => {
//     const { userId, productId, interactionType, rating } = req.body;

//     // Log user interaction
//     try {
//         await pool.query(`
//             INSERT INTO user_interactions (user_id, product_id, interaction_type, rating)
//             VALUES ($1, $2, $3, $4)
//         `, [userId, productId, interactionType, rating]);

//         res.json({ success: true, message: 'Interaction logged' });
//     } catch (error) {
//         res.status(500).json({ success: false, error: error.message });
//     }
// });

// // Personalized User Profiles: Creating user preferences based on past interactions
// async function createUserProfile(userId) {
//     const interactions = await pool.query('SELECT * FROM user_interactions WHERE user_id = $1', [userId]);
//     const products = interactions.rows.map(interaction => interaction.product_id);
//     const categories = [];

//     // Extract categories of products user interacted with
//     const productCategories = await pool.query(`
//         SELECT DISTINCT category
//         FROM products
//         WHERE product_id = ANY($1::int[])
//     `, [products]);

//     productCategories.rows.forEach(row => categories.push(row.category));

//     // Calculate user profile (simple example: most frequent categories)
//     const profile = _.countBy(categories);
//     return profile;
// }

// // API Route for Recommendations
// app.get('/recommendations/:userId', async (req, res) => {
//     const userId = req.params.userId;

//     try {
//         const isNew = await isNewUser(userId);
//         let recommendations = [];

//         if (isNew) {
//             // Recommend top products for new users
//             recommendations = await recommendForNewUser();
//         } else {
//             // For existing users, use hybrid recommendation
//             recommendations = await hybridRecommendation(userId);
//         }

//         res.json({ success: true, recommendations });
//     } catch (error) {
//         res.status(500).json({ success: false, error: error.message });
//     }
// });

// // User Profile Route: Retrieve user profile
// app.get('/profile/:userId', async (req, res) => {
//     const userId = req.params.userId;

//     try {
//         const profile = await createUserProfile(userId);
//         res.json({ success: true, profile });
//     } catch (error) {
//         res.status(500).json({ success: false, error: error.message });
//     }
// });

// // A/B Testing for different recommendation strategies
// app.get('/test-recommendations/:userId', async (req, res) => {
//     const userId = req.params.userId;

//     // A/B Testing: Randomly choose between collaborative and content-based
//     const isCollaborative = Math.random() < 0.5;
//     const recommendations = isCollaborative
//         ? await collaborativeFiltering(userId)
//         : await contentBasedFiltering(userId);

//     res.json({
//         success: true,
//         strategy: isCollaborative ? 'Collaborative' : 'Content-Based',
//         recommendations
//     });
// });

// // Start the server
// const port = 3000;
// app.listen(port, () => {
//     console.log(`Server is running on http://localhost:${port}`);
// });
